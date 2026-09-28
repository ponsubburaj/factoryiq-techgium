# FactoryIQ Architecture

```text
                 Operator / Engineer
                         |
                  Question / Image
                         |
                         v
                    MIRA UI
                         |
             +-----------+-----------+
             |                       |
             v                       v
        Text Retrieval         Vision Analysis
             |                       |
             +-----------+-----------+
                         |
                         v
                 Approved Evidence
                         |
                         v
                 Governance Engine
                 /       |        \
                /        |         \
             ANSWER   ABSTAIN   ESCALATE
                |                  |
                |             Expert Approval
                +--------+---------+
                         |
                         v
                      Audit
```

## Governance controls

1. Current revision preferred.
2. Superseded revisions are excluded from normal generation but inspected by the governance pass.
3. Weak evidence causes ABSTAIN.
4. Safety-critical bypass/disable/override requests cause ESCALATE.
5. Expert decisions are recorded.
6. Sources expose document, revision, page, category and score.
