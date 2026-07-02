# Signing In And Selecting Your Location

**Audience / required role:** All users  
**Applies to:** Sign-in, active company/brand/location context, and scoped navigation  
**Related phase/module:** Phase I / Access and Operating Context  
**Last verified against:** implemented local sign-in scaffold, authorized location context, and header location switcher

## Purpose

Use this article to sign in and confirm you are working in the correct branch, warehouse, or other authorized location.

Many ERP screens use the active location in the header. Selecting the wrong location can make records appear missing or can block workflow actions.

## Steps

1. Open the ERP sign-in page.
2. Sign in with the account or role provided for your user.
3. After sign-in, check the page header.
4. Confirm the company, brand, and location context.
5. If you have more than one authorized location, open the location selector in the header.
6. Choose the correct location.
7. Select `Switch`.
8. Open the module you need from the navigation.

## Expected Result

- The header shows the selected operating location.
- The navigation shows only modules available to your permissions.
- Lists, dashboards, inventory pages, transfers, receiving, wastage, adjustments, and approvals use the selected context where applicable.

## Important Controls And Warnings

- The location selector only shows locations assigned to your user.
- Switching location does not grant new permissions.
- Direct links still enforce permission and scope checks.
- If you cannot see an expected location, ask an administrator to review your role and scope assignment.

## Related Articles

- Why can't I see my branch, warehouse, or request?
- Understanding the dashboard, My Tasks, and notifications
- Understanding statuses, audit history, and attachments
