# OGFI ERP Glossary

| Term | Meaning |
|---|---|
| Company | A legal or operating entity using the ERP, such as One Gourmet Foods Inc. |
| Organization code | The tenant identifier entered with an email and password to sign in to the correct ERP organization. |
| Brand | A restaurant concept operated under a company. |
| Location | A branch, warehouse, commissary, Head Office, project site, or future temporary site. |
| Scope | The company, brand, location, department, or project access assigned to a user. |
| Purchase Request (PR) | A request to obtain goods or services that may require approval before purchasing. |
| Purchase Order (PO) | An approved order issued to a supplier. |
| Receiving Report | The record of goods accepted, rejected, damaged, short, or partially delivered. |
| Transfer | A controlled movement of stock from one location to another. |
| Stock Count | A physical count of inventory compared against system stock. |
| Wastage | Stock lost through spoilage, damage, expiry, preparation loss, or another approved reason. |
| Stock Adjustment | A controlled inventory correction that requires a reason and may require approval. |
| Approval | A recorded decision that allows, rejects, or returns a request under the configured approval rules. |
| Audit Trail | The history of who created, changed, approved, rejected, cancelled, or otherwise acted on a record. |
| Runtime MFA | A live multifactor check performed by OGFI ERP using an enrolled authenticator or an unused recovery code. External MFA evidence alone does not satisfy it. |
| MFA challenge lock | Automatic revocation of an incomplete MFA challenge after the configured failed-attempt limit. A new password sign-in is required before trying again. |
| MFA step-up | A fresh runtime MFA check required before a sensitive action. The current assurance window is 15 minutes. |
| Recovery code | One of 10 single-use codes issued after MFA enrollment. It can replace an authenticator code when the device is unavailable. |
| Application session | A server-controlled signed-in session that can expire or be revoked without deleting the user account. |
| Activation link | A single-use link sent directly to the account email address so a user can create or replace local credentials. It expires after 30 minutes and is not displayed to administrators. |
| Controlled recovery | The audited process for recovering an existing account: one administrator submits identity evidence and a different MFA-assured administrator approves or rejects the request. |
| First-administrator bootstrap | A deployment-only, one-time tenant ceremony that issues the initial administrator activation through a restricted file. It cannot be reused for recovery or another user. |
