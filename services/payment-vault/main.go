package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"

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

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{kafkaBroker},
		Topic:   "payment-requested",
		GroupID: "payment-vault-group",
	})
	defer reader.Close()

	writer := kafka.NewWriter(kafka.WriterConfig{
		Brokers: []string{kafkaBroker},
	})
	defer writer.Close()

	log.Println("Payment Vault Service started. Listening for payment requests...")

	for {
		m, err := reader.ReadMessage(context.Background())
		if err != nil {
			log.Printf("Error reading message: %v\n", err)
			continue
		}

		var req PaymentRequest
		if err := json.Unmarshal(m.Value, &req); err != nil {
			log.Printf("Failed to unmarshal: %v\n", err)
			continue
		}

		log.Printf("Processing payment for booking %s, amount %.2f\n", req.BookingID, req.Amount)

		// Check if user has a stored payment method
		var paymentMethodID string
		err = db.QueryRow("SELECT stripe_payment_method_id FROM payments.vault WHERE user_id = $1 LIMIT 1", req.UserID).Scan(&paymentMethodID)
		
		var topic string
		var result PaymentResult
		result.BookingID = req.BookingID
		result.UserID = req.UserID

		if err != nil {
			log.Printf("No payment method found for user %s\n", req.UserID)
			topic = "payment-failed"
			result.Status = "FAILED"
			result.Reason = "No payment method on file"
		} else {
			// Simulate contacting payment gateway (Stripe)
			log.Printf("Charged payment method %s successfully\n", paymentMethodID)
			topic = "payment-processed"
			result.Status = "SUCCESS"
		}

		resBytes, _ := json.Marshal(result)
		err = writer.WriteMessages(context.Background(), kafka.Message{
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
