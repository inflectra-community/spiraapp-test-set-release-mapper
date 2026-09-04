# Test Set Release Mapper

Maps all test cases in a selected test set to a chosen active release in a single operation.

## Overview

This SpiraApp provides two features for managing release/test case coverage from test sets:

1. **Map to Release (Test Set List page)** — Select a test set, pick a release from a dropdown, and map all its test cases to that release.
2. **Sync to Scheduled Release (Test Set Details page)** — On the detail view of a test set that has a Scheduled Release set, check which test cases are not yet mapped to that release and offer to map them in one click.

This is useful when you have a test set representing a scope of testing for a release and want to quickly establish release/test case coverage without manually adding each test case to the release individually.

## How It Works

### Map to Release (Test Set List)

1. User selects a single test set on the Test Set List page
2. Clicks the "Map to Release" toolbar button
3. The SpiraApp retrieves all active releases (Planned or In Progress) and presents a dropdown
4. User selects a release and clicks "Map"
5. The SpiraApp retrieves test cases from the selected test set
6. Checks which test cases are already mapped to the release (to avoid duplicates)
7. Creates the release/test case mappings for any unmapped test cases
8. Reports how many were mapped and how many were already linked

### Sync to Scheduled Release (Test Set Details)

1. User opens a test set's detail page
2. Clicks the "Sync to Scheduled Release" toolbar button
3. The SpiraApp reads the test set's Release (Scheduled) field
4. If no release is set, displays a warning to set one first
5. Retrieves test cases in the test set and checks which are already mapped to the scheduled release
6. If all are mapped, displays a success message
7. If some are unmapped, shows a confirmation dialog with the count and release name
8. User clicks "Map Now" to create the mappings
9. Reports how many were mapped, already linked, and skipped (cross-product)

## Permissions Required

The user's Product Role must have the following permissions:

| Artifact | View | Modify |
|----------|------|--------|
| Test Sets | ✅ | — |
| Test Cases | ✅ | ✅ |
| Releases | ✅ | ✅ |

- **View Test Sets**: Required to be on the Test Set List page (implicitly satisfied)
- **View Test Cases**: Required to retrieve test cases from the test set
- **View Releases**: Required to retrieve the list of active releases
- **Modify Test Cases**: Required by the API when creating release/test case mappings
- **Modify Releases**: Required by the API when creating release/test case mappings

The SpiraApp checks for Modify permissions on Releases and Test Cases upfront. If either is missing, the user sees a clear error message before any API calls are made. If View permissions are missing, the relevant API call will fail and the user sees a descriptive message suggesting they check their permissions.

## Installation

1. Go to System Administration > General Settings and enable **Developer Mode**
2. Go to System Administration > SpiraApps and upload the `.spiraapp` file
3. Activate the SpiraApp system-wide
4. Go to the product(s) where you want to use it and **Enable** the SpiraApp

No product-level settings are required.

## Error Messages

| Message | Cause |
|---------|-------|
| Please select a test set | No item selected in the grid |
| Please select only one test set | Multiple items selected |
| You don't have permission to map test cases to releases | User lacks Modify on Releases or Test Cases |
| Could not retrieve releases. Check you have permission to view releases in this product | GET releases failed (likely missing View Releases permission) |
| No active releases available | No releases with status Planned or In Progress |
| No test cases in selected test set | The selected test set contains no test cases |
| No test cases in this test set | Test Set Details: the test set has no test cases |
| No scheduled release is set for this test set. Set the Release field first. | Test Set Details: the Release field is empty |
| Could not retrieve test cases. Check you have permission to view test cases in this product | GET test cases failed (likely missing View Test Cases permission) |
| All X test case(s) are already mapped to this release | Every test case is already linked — nothing to do |
| All X test case(s) are already mapped to release 'Y' | Test Set Details: all test cases already mapped to the scheduled release |
| Could not create release mappings. Check you have permission to modify releases and test cases in this product | POST mapping failed (likely missing Modify permission) |
| Operation already in progress | User clicked the button while a previous operation is still running |

## Shared (Cross-Product) Test Cases

If a test set contains test cases shared from other products, the SpiraApp will automatically skip them during mapping. Only test cases that belong to the current product are mapped to the selected release. The success message reports how many were skipped, e.g.: "Successfully mapped 3 test case(s) to release (1 skipped from other products)."

This is by design — release/test case mappings are only meaningful within the same product.
