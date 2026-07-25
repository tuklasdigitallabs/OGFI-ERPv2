# Web quality gates restored

The web lint and TypeScript gates are green after removing obsolete client overflow state left behind by the bounded Purchase Request lookup migration. No user workflow policy changed.

User Access now limits assigned-role and effective-permission reads to the Overview and Roles sections. Other sections show an unavailable marker for those summaries, while role Requests retains only the identifiers needed by its assignment catalog.
