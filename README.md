# Vaultline Clearinghouse

**Zero-Knowledge Solvency Thresholds & Certified Custodian Escrow on Midnight**

In commercial OTC settlements, bullion clearing, and milestone procurement, counterparties require cryptographic proof that principal funds are locked and exceed an agreed floor before executing delivery—without allowing the counterparty or public observers to see the depositor's actual reserve size.

Vaultline separates **solvency verification** from **balance disclosure** using Midnight's `Compact 0.35.0` zero-knowledge circuits.

---

### Protocol Lifecycle

```text
[Admin] ---> registerCustodian(custodianPk)
                 |
[Depositor] -> createEscrow(escrowId, threshold, deadline)
                 |  stores blinded commitment = H(amount, currency, deadline, depositorPk, salt)
                 v
[Custodian] -> attestDeposit(escrowId)
                 |  certifies physical/fiat reserve backing
                 v
[Counterparty] -> verifyEscrow(escrowId)
                 |  proves in ZK: amount >= minThreshold & status == Active & custodianAttested
                 v
[Settlement] -> releaseEscrow(escrowId)  OR  initiateDispute -> resolveDispute / expireEscrow
                 |  burns caller-independent nullifier H("vaultline:settle-nullifier:v2", escrowId, salt)
```

### Key Security Invariants

* **Blind Range Verification (`meetsThreshold`)**: The circuit checks `terms.amount >= minThreshold` inside the witness environment. Whether a tranche holds `$25,000` or `$750,000` above a `$25,000` floor produces the exact same public state transition.
* **Custodian Co-Signing (`attestDeposit`)**: A depositor cannot self-certify unbacked commitments; `verifyEscrow` and `releaseEscrow` require an allow-listed custodian signature in `custodianApprovals`.
* **Caller-Independent Settlement Nullifier**: `escrowNullifier` binds `(escrowId, salt)` rather than the caller's secret key, preventing double-settlement even if both the beneficiary and arbiter attempt concurrent resolution.
* **Timelock Clawback (`expireEscrow`)**: If a tranche remains unsettled past `deadline`, the depositor can reclaim principal directly via a zero-knowledge deadline check (`currentTime >= terms.deadline`).

---

### Commands

| Command | Description |
| :--- | :--- |
| `npm test` | Runs 31 Vitest specifications (compiled contract simulator, custodian checks, dispute flows, and differential fuzzing). |
| `npm run demo` | Executes an end-to-end clearinghouse lifecycle in the terminal and audits public ledger state for zero byte leakage. |
| `npm run dev` | Starts the Zurich Custody Clearinghouse console locally. |
| `npm run build` | Bundles the static web application and WASM circuit runner into `dist/`. |

---

Licensed under Apache-2.0.
