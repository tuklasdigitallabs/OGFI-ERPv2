# DEC-0192 — Permission Access Summary Truth

**Status:** ACCEPTED — source-of-truth alignment

Permission Access now shows the exact paginated granting-role total while
labeling the user number as **Preview users shown**. Each role contributes at
most five current-company active-user previews; the value is explicitly not an
exhaustive effective-user total. This preserves the bounded-preview contract
approved by DEC-0152 and avoids inventing a new policy metric. A distinct-user
effective-access aggregate remains a future decision if access-review policy
requires it.
