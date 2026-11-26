# TISE eval scorecard

Fixed clock: 2026-11-26T14:00:00.000Z. Training vignettes only. A row fails when the posture does not match the vignette contract.

| Vignette | Expected | Actual | Threat | Deception | Confidence | Leading hypothesis | H (bits) | Rejected | Max falsity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| district-seven | MANEUVER | MANEUVER | HIGH | HIGH | LOW | H1_PREPARED_DEFENSE | 1.66 | 0 | 0.74 |
| corridor-mirage | WITHDRAW | WITHDRAW | HIGH | HIGH | MODERATE | H2_COORDINATED_AMBUSH | 0.22 | 0 | 0.73 |
| iron-anvil | STRIKE | STRIKE | CRITICAL | LOW | HIGH | H1_PREPARED_DEFENSE | 0.09 | 0 | 0.00 |
| blackout-ddil | HOLD | HOLD | LOW | LOW | LOW | H4_STALE_OR_VACANT | 2.00 | 1 | 0.00 |

Result: all vignettes matched their contracted posture.
