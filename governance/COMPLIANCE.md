# Compliance Attestations Ledger

This document tracks the status of critical regulatory and security compliance frameworks. Continuous compliance is maintained through automated auditing, infrastructure-as-code, and regular penetration testing.

## PCI DSS (Payment Card Industry Data Security Standard)
**Status**: [ACTIVE / IN-PROGRESS]
**Scope**: Tokenization service, payment vault, and core booking execution orchestrator.
- **Cardholder Data Environment (CDE)**: Strictly isolated via Istio Zero-Trust policies.
- **Vulnerability Scanning**: Automated Dependabot and Trivy scans on every PR.
- **ASV Scans**: Executed quarterly (Automated via `.github/workflows/security-scans.yml`).

## SOC 2 Type II
**Status**: [ACTIVE / IN-PROGRESS]
**Scope**: Platform-wide availability, security, and processing integrity.
- **Audit Logging**: Comprehensive logging via Kubernetes Audit Policy capturing all configuration changes and access.
- **Access Controls**: Multi-factor authentication required for all infrastructure access. JIT privilege elevation for production systems.

## GDPR (General Data Protection Regulation)
**Status**: [ACTIVE]
**Scope**: Global user base, prioritizing EU data subjects.
- **Data Subject Access Requests (DSAR)**: Automated via the Privacy Portal.
- **Right to Erasure**: Hard deletes implemented across all datastores for user profile and tokenized data.
- **DPIA**: Mandated for all new feature rollouts (see `DPIA.md`).
