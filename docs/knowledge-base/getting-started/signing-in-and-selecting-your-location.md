# Signing In And Selecting Your Location

**Who can do this:** Any active user with local credentials; location choices depend on assigned scope

**Applies to:** Local sign-in, privileged MFA, active company/brand/location context, and scoped navigation

**Related phase/module:** Phase I / Access and Operating Context

**Last verified against:** implemented local production sign-in, runtime MFA, authorized location context, and header location switcher

## Purpose

Use this article to sign in and confirm you are working in the correct branch, warehouse, or other authorized location.

Many ERP screens use the active location in the header. Selecting the wrong location can make records appear missing or can block workflow actions.

## Prerequisites

- Your organization code, email, and password.
- Privileged users also need their enrolled authenticator or one unused recovery code.
- Your administrator must assign at least one authorized location.

## Navigation Path

Open the ERP sign-in page. After sign-in, use the location selector in the page header.

## Steps

1. Open the ERP sign-in page.
2. Enter your `Organization code`, `Email`, and `Password`.
3. Select `Sign in`.
4. If `Verify authenticator` appears, enter the current six-digit authenticator code or one unused recovery code, then select `Verify and continue`.
5. If authenticator setup is required, follow the on-screen setup under `Account security` before continuing.
6. Check the company, brand, location type, and selected location in the page header.
7. If you have more than one authorized location, choose the correct location from the selector and select `Switch`.
8. Open the module you need from the navigation.

## First-Time Privileged MFA Enrollment

1. On `Account security`, select `Start authenticator setup`.
2. Scan the QR code with a compatible authenticator app. If scanning is unavailable, enter the displayed manual key in the app.
3. Enter the current six-digit code and select `Verify and activate MFA`.
4. Save all 10 one-time recovery codes in an approved secure location. They are not shown again.
5. Select `Continue to OGFI ERP`.

## Expected Result

- The header shows the selected operating location.
- The navigation shows only modules available to your permissions.
- Lists, dashboards, inventory pages, transfers, receiving, wastage, adjustments, and approvals use the selected context where applicable.
- Privileged users enter the ERP only after completing runtime MFA.

## Important Controls And Warnings

- The location selector only shows locations assigned to your user.
- Switching location does not grant new permissions.
- Direct links still enforce permission and scope checks.
- Do not share passwords, authenticator codes, recovery codes, or activation links.
- Passwords are protected using Argon2id. Administrators cannot retrieve an existing password; use controlled recovery when replacement is required.
- Sensitive actions require MFA assurance refreshed within the current 15-minute step-up window. If prompted, open `Security`, select `Refresh MFA assurance`, complete the challenge, and retry the action.
- An organization code identifies the ERP organization; it is not a company, brand, or location selection.
- Repeated invalid sign-in attempts may temporarily block further attempts. Wait for the message’s stated period or contact support.
- If you cannot see an expected location, ask an administrator to review your role and scope assignment.

## What Happens Next

Your selected context applies to location-scoped work until you switch it. A privilege change, session revocation, session expiry, or expired break-glass scope can require you to sign in again or can remove access immediately.

## Related Articles

- Why can't I see my branch, warehouse, or request?
- Understanding the dashboard, My Tasks, and notifications
- Understanding statuses, audit history, and attachments
- Session Invalidation And Reauthentication
