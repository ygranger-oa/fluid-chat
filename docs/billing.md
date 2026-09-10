# Billing and Usage

Fluid Chat keeps hosted billing state on the workspace record:

```text
plan
stripe_customer_id
subscription_status
seat_limit
max_upload_mb
storage_limit_mb
file_retention_days
overage_allowed
grace_period_ends_at
read_only_at
```

Owners can update billing fields through `PATCH /api/workspaces/:workspaceId`.
Admins can view usage through `GET /api/workspaces/:workspaceId/usage`.

Billing rules implemented in the MVP:

- Pending invites are counted separately and are not billable.
- Active members count toward the seat limit.
- Removed members do not count toward the seat limit.
- Workspace admins can configure `seat_limit`, `max_upload_mb`, `storage_limit_mb` and `file_retention_days` from workspace settings.
- Invite acceptance is blocked when the active member count would exceed `seat_limit`, unless `overage_allowed` is true.
- Workspaces become read-only when `read_only_at` is in the past.
- The worker flips expired `grace_period` workspaces to `read_only`.

Stripe checkout, customer portal, and webhook handlers are intentionally left as hosted deployment integration points.
