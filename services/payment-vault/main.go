package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/segmentio/kafka-go"
)

type PaymentRequest struct {
	BookingID string  `json:"booking_id"`
	UserID    string  `json:"user_id"`
	Amount    float64 `json:"amount"`
}

type PaymentResult struct {
	BookingID string `json:"booking_id"`
	UserID    string `json:"user_id"`
	Status    string `json:"status"` // "SUCCESS" or "FAILED"
	Reason    string `json:"reason,omitempty"`
}

type TokenCapturedEvent struct {
	UserID   string `json:"user_id"`
	Token    string `json:"token"`
	ExpMonth int    `json:"exp_month"`
	ExpYear  int    `json:"exp_year"`
}

func main() {
	dbConnStr := os.Getenv("DB_CONN")
	if dbConnStr == "" {
		dbConnStr = "host=localhost port=5432 user=travel_user password=travel_password dbname=travel_db sslmode=disable"
	}

	db, err := sql.Open("postgres", dbConnStr)
	if err != nil {
		log.Fatalf("Failed to connect to db: %v", err)
	}
	defer db.Close()

	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "localhost:9092"
	}

	paymentReqReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{kafkaBroker},
		Topic:   "payment-requested",
		GroupID: "payment-vault-group",
	})
	defer paymentReqReader.Close()

	tokenCapReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{kafkaBroker},
		Topic:   "payment-token-captured",
		GroupID: "payment-vault-token-group",
	})
	defer tokenCapReader.Close()

	writer := kafka.NewWriter(kafka.WriterConfig{
		Brokers: []string{kafkaBroker},
	})
	defer writer.Close()

	log.Println("Payment Vault Service started. Listening for requests and tokens...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		log.Println("Shutting down...")
		cancel()
	}()

	// Go routine to handle token captures
	go func() {
		for {
			m, err := tokenCapReader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("Error reading token message: %v\n", err)
				continue
			}

			var evt TokenCapturedEvent
			if err := json.Unmarshal(m.Value, &evt); err != nil {
				log.Printf("Failed to unmarshal token event: %v\n", err)
				continue
			}

			log.Printf("Processing token capture for user %s\n", evt.UserID)

			// Encrypt token
			encryptedToken, keyVersion, err := Encrypt([]byte(evt.Token))
			if err != nil {
				log.Printf("Failed to encrypt token for user %s: %v\n", evt.UserID, err)
				continue
			}

			// Store in DB
			_, err = db.ExecContext(ctx, `
				INSERT INTO payments.vault (user_id, encrypted_token, key_version, exp_month, exp_year)
				VALUES ($1, $2, $3, $4, $5)
			`, evt.UserID, encryptedToken, keyVersion, evt.ExpMonth, evt.ExpYear)

			if err != nil {
				log.Printf("Failed to store encrypted token: %v\n", err)
			} else {
				log.Printf("Successfully securely stored token for user %s (key ver: %s)\n", evt.UserID, keyVersion)
			}
		}
	}()

	// Main routine handles payment requests
	for {
		m, err := paymentReqReader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			log.Printf("Error reading payment message: %v\n", err)
			continue
		}

		var req PaymentRequest
		if err := json.Unmarshal(m.Value, &req); err != nil {
			log.Printf("Failed to unmarshal payment req: %v\n", err)
			continue
		}

		log.Printf("Processing payment for booking %s, amount %.2f\n", req.BookingID, req.Amount)

		var encryptedToken []byte
		var keyVersion string
		var expMonth, expYear int

		// Retrieve the encrypted token from Vault
		err = db.QueryRowContext(ctx, `
			SELECT encrypted_token, key_version, exp_month, exp_year 
			FROM payments.vault 
			WHERE user_id = $1 
			ORDER BY created_at DESC LIMIT 1
		`, req.UserID).Scan(&encryptedToken, &keyVersion, &expMonth, &expYear)
		
		var topic string
		var result PaymentResult
		result.BookingID = req.BookingID
		result.UserID = req.UserID

		if err != nil {
			log.Printf("No payment method found for user %s: %v\n", req.UserID, err)
			topic = "payment-failed"
			result.Status = "FAILED"
			result.Reason = "No payment method on file"
		} else {
			// Decrypt Token
			plaintextToken, err := Decrypt(encryptedToken, keyVersion)
			if err != nil {
				log.Printf("Failed to decrypt token for user %s: %v\n", req.UserID, err)
				topic = "payment-failed"
				result.Status = "FAILED"
				result.Reason = "Internal Error: Could not process payment method"
			} else {
				// Check Expiration (mock implementation)
				currentYear := time.Now().Year()
				currentMonth := int(time.Now().Month())
				
				if expYear < currentYear || (expYear == currentYear && expMonth < currentMonth) {
					log.Printf("Payment method expired for user %s\n", req.UserID)
					topic = "payment-failed"
					result.Status = "FAILED"
					result.Reason = "Payment method expired"
				} else {
					// Simulate contacting payment gateway (Stripe) with the plaintextToken
					// NEVER LOG THE PLAINTEXT TOKEN IN PRODUCTION
					log.Printf("Charged payment method successfully via orchestration service (Token: %sXXXX)\n", string(plaintextToken)[:4]) // Masked logging
					topic = "payment-processed"
					result.Status = "SUCCESS"
				}
			}
		}

		resBytes, _ := json.Marshal(result)
		err = writer.WriteMessages(ctx, kafka.Message{
			Topic: topic,
			Value: resBytes,
		})

		if err != nil {
			log.Printf("Failed to write result to kafka: %v\n", err)
		} else {
			log.Printf("Published to topic %s\n", topic)
		}
	}
}
