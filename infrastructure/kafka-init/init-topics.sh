#!/bin/bash

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
cub kafka-ready -b kafka:29092 1 20

# Create topics
echo "Creating Kafka topics..."

kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic user-registered
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic flight-search-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic booking-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic payment-processed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic payment-failed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic booking-confirmed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic booking-failed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic notification-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic offer-price-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic offer-price-responded
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic offer-price-failed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic gds-booking-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic gds-booking-confirmed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic gds-booking-failed
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic payment-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic payment-refund-requested
kafka-topics --create --if-not-exists --bootstrap-server kafka:29092 --partitions 3 --replication-factor 1 --topic payment-refunded

echo "Kafka topics created successfully!"
