package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sync"
)

// MockKMS simulates a Key Management Service with key rotation.
// In a real application, this would integrate with AWS KMS, Google Cloud KMS, or HashiCorp Vault.
type MockKMS struct {
	mu            sync.RWMutex
	keys          map[string][]byte
	currentKeyVer string
}

var kms *MockKMS

func init() {
	// Initialize with a default key for demonstration.
	// Keys must be 32 bytes for AES-256.
	key1, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	
	kms = &MockKMS{
		keys: map[string][]byte{
			"v1": key1,
		},
		currentKeyVer: "v1",
	}
}

// GetKey retrieves a key by version.
func (k *MockKMS) GetKey(version string) ([]byte, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()
	
	key, ok := k.keys[version]
	if !ok {
		return nil, fmt.Errorf("key version %s not found", version)
	}
	return key, nil
}

// GetCurrentKey retrieves the current active key and its version.
func (k *MockKMS) GetCurrentKey() ([]byte, string) {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.keys[k.currentKeyVer], k.currentKeyVer
}

// Encrypt encrypts the plaintext using AES-256-GCM with the current key.
func Encrypt(plaintext []byte) (ciphertext []byte, keyVersion string, err error) {
	key, version := kms.GetCurrentKey()
	
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, "", err
	}

	// Create a nonce. Nonce size is standard for GCM (12 bytes).
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, "", err
	}

	// Seal appends the ciphertext and auth tag to the nonce.
	ciphertext = aesGCM.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, version, nil
}

// Decrypt decrypts the ciphertext using AES-256-GCM with the specified key version.
func Decrypt(ciphertext []byte, keyVersion string) (plaintext []byte, err error) {
	key, err := kms.GetKey(keyVersion)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	nonce, ciphertextActual := ciphertext[:nonceSize], ciphertext[nonceSize:]
	
	plaintext, err = aesGCM.Open(nil, nonce, ciphertextActual, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}
