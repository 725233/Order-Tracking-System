# Portfolio Case Study: OrderFlow

## Project summary

OrderFlow is an AI-assisted internal operations platform that coordinates an order from its initial request through procurement, management approval, payment, receiving, and final customer delivery.

This portfolio edition uses fictional data and branding. The production system and its operational records remain private.

## The problem

A single order can contain several items with different suppliers, owners, prices, lead times, approvals, payments, and delivery dates. When those updates live in separate spreadsheets, emails, and chat threads, teams struggle to answer basic operational questions:

- Who needs to act next?
- Which item is delayed?
- Was the supplier approved?
- Has the item been paid, received, and delivered?
- Which orders were BOM, stock replenishment, or customer orders?
- What should management receive in the year-end report?

## My role

I acted as the product and workflow owner and led an AI-assisted implementation process. My work included:

- Mapping the real departmental workflow and exception cases.
- Defining the data model at both order and item level.
- Turning staff feedback into prioritized product requirements.
- Designing role permissions, dashboard behavior, reporting, and reminders.
- Reviewing prototypes with users and iterating on terminology and interaction design.
- Testing PDF extraction, VAT calculations, lead-time handling, supplier changes, and cross-department visibility.
- Planning a secure gateway so AI credentials never reach the browser.

## Key product decisions

### Track items independently

The order is the shared container, but every item has its own procurement owner, source, cost, ETA, approval, payment, and logistics status. This prevents one delayed line item from hiding the progress of the rest of the order.

### Keep one shared status view

Each department gets a focused queue, while the All Orders dashboard provides a common operational picture. Sensitive controls remain role-restricted even when status information is shared.

### Make AI output editable

PDF and text extraction never creates an order immediately. Gemini prepares a draft, missing fields are highlighted, and a Sales Coordinator reviews everything before submission.

### Preserve decision context

Management can approve the procurement source or select another supplier. The final source decision, recommendation, link, price, comment, and timestamp remain visible in the item history.

### Design for low operational overhead

The application uses serverless services and optional Google Sheets synchronization. Department reminder content is generated centrally and can be delivered by a scheduled automation.

## Most important features

| Area | Product outcome |
|---|---|
| Intake | Manual, Excel, PDF, and pasted-text order creation |
| Classification | BOM, Stock Request, and Customer Order reporting |
| Sales | Website-lead flag, item delivery dates, VAT-inclusive pricing |
| Procurement | Item assignment, sourcing details, supplier links, editable ETA |
| Management | Approve or replace the supplier per item |
| Accounts | Payment queue and payment-reference history |
| Logistics | Receiving, dispatch, balance, tracking, and delivery updates |
| Collaboration | Order comments and cross-department history |
| Administration | User roles, access removal, and filtered report exports |
| Automation | Department reminder digests and AI-assisted data extraction |

## Technical challenges

### Secure AI access across hosting providers

The browser never calls Gemini directly. Server routes call a protected Cloud Run gateway, which authenticates with its Google Cloud service account and forwards only an allowlisted request shape to Vertex AI.

### Preserving item-level state

Status calculations combine assignment, sourcing, approval, payment, and delivery fields. The UI must summarize an entire order without losing the current state of each line item.

### Safe supplier-page lookup

Product links are validated before use. Private IP ranges, local domains, embedded credentials, and unsupported ports are rejected. Gemini is instructed to return no price when a page is ambiguous or inaccessible.

### Human review for document extraction

The extraction prompt separates pre-VAT unit price, VAT rate, line total, and VAT-inclusive selling price. Lead-time ranges are converted into item-level planned delivery dates while the draft remains fully editable.

## What I would add next

- Automated API and role-permission tests.
- Queue and retry handling for external integrations.
- Structured audit-event exports for compliance reviews.
- Central observability, alerting, and service-level targets.
- Workspace SSO independent of the hosting provider.
- A dedicated analytics layer for cycle time, supplier performance, and bottleneck reporting.

## Privacy statement

No production orders, customer names, employee identities, credentials, deployment identifiers, webhook addresses, or company-only documents are included in this portfolio repository.
