# Record and Post Menu Servings

Use **Restaurant Ops → Servings & Consumption** to record the menu portions a
branch actually prepared and issued during a configured service period. The
workspace is available only after an administrator activates a branch-specific
configuration.

## Roles

- **Branch Staff / Branch Supervisor:** create, edit, submit, and correct serving
  declarations for an assigned branch.
- **Branch Manager:** verify submitted facts and, with the separate permission and
  current MFA, explicitly post expected ingredient consumption.
- **Remote Area / Operations Manager:** may verify or post only when explicitly
  assigned the same branch scope and permissions.

The encoder cannot verify or post their own declaration. Verification does not
change inventory; **Post Consumption** is a separate controlled action.

## Why a menu item is available

An approved published recipe is a formula candidate. An administrator separately
adopts it as the brand default for the linked menu item. Every active branch of
that brand inherits the default unless the branch is marked **Unavailable** or has
an approved location override. Company-shared recipes require explicit adoption
by each brand, and recipes from another brand are never offered as a fallback.

Pending supplier cost is shown as a warning and does not by itself block quantity
derivation. A missing recipe mapping, ingredient/UOM conversion, issue location,
or stock prerequisite remains a quantity-readiness blocker.

## Record a service period

1. Select the exact branch context.
2. Open **Servings & Consumption** and choose **Record servings**.
3. Select the business date and configured service period.
4. Add each menu item and quantity served. The catalog contains active menu items
   offered by the branch.
5. Choose `Paid` for normal orders. Choose `Complimentary` only for an authorized
   menu serving issued without payment, then enter its reason and operational
   reference.
6. Save the draft, review every line, and submit after the service period closes.

Do not enter staff meals here. A pre-preparation cancellation creates no serving;
a prepared item that was not issued belongs in Wastage. A served item that is
later refunded remains consumed. For a remake, record the discarded original as
Wastage and the issued replacement as a serving.

## Verify and post

1. A different manager opens the submitted declaration and selects **Verify
   serving facts**.
2. The ERP freezes the recipe, yield, UOM, and expected ingredient snapshot. If a
   recipe or mapping is missing, the declaration remains preserved with readiness
   blockers and inventory is unchanged.
3. An authorized non-encoder selects **Post Consumption**. The ERP allocates
   eligible lots by FEFO and posts the whole document exactly once.

Insufficient eligible stock, negative-stock risk, a count freeze, stale scope or
permission, missing MFA, or any unresolved line blocks the complete post. The ERP
does not partially post a declaration.

## Corrections

- A submitted declaration may be returned to the encoder for correction.
- A draft or returned declaration may be cancelled with a reason.
- A verified but unposted declaration may be cancelled by an authorized manager.
- A posted declaration is corrected only by a full reversal, followed by **Create
  corrected revision**. Posted movements and prior facts remain in history.

Reports and exports call the recipe-derived result **Expected/Book Consumption**.
It is not independent proof of physical usage, loss, or theft. Blind physical
counts and controlled variance review remain the evidence for observed on-hand.
