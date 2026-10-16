# Part A — Python Problem-Solving Exercises

Three standalone Python solutions with built-in examples. Requires Python 3; no third-party packages are needed.

## Run

From the repository root:

```sh
python -X utf8 part-a/Pagination_bar_A1.py
python -X utf8 part-a/duplicate_leads_A3.py
python -X utf8 part-a/settle_up_A4.py
```

On Windows, `py -3 -X utf8` can replace `python -X utf8` when the Python launcher is installed. UTF-8 mode supports the ellipsis and rupee symbols.

## A1 — Pagination bar

[Pagination_bar_A1.py](Pagination_bar_A1.py) defines `pages(current, total)`.

Returns the first page, last page, current page and valid immediate neighbours. A gap of one missing page includes that page; larger gaps become `"…"`. An out-of-range current page raises `ValueError`. Inputs are expected to be integers with a positive total.

Bundled example:

```python
pages(4, 7)
# [1, 2, 3, 4, 5, 6, 7]
```

The result contains integer page numbers and, where needed, ellipsis strings.

## A3 — Duplicate leads

[duplicate_leads_A3.py](duplicate_leads_A3.py) defines `findDuplicates(leads)`.

Each lead has the format `[lead_id, name, phone, email]`. Phone comparison removes spaces, hyphens and parentheses, then uses the last ten characters. Emails are trimmed and lowercased. Matching either value connects leads. Graph traversal groups transitive matches: A matching B and B matching C puts all three in one group.

Only groups with at least two leads are returned. IDs within each group are sorted, and groups are sorted by their first ID. The bundled sample prints:

```text
[[1, 2, 3], [4, 5]]
```

Inputs are expected to have unique, sortable IDs and valid, non-empty phone and email strings. This solution normalizes comparisons; it does not perform full contact validation.

## A4 — Expense settlement

[settle_up_A4.py](settle_up_A4.py) defines `settle(expenses)`.

Each expense is `(payer, amount, [participants])`. The amount is divided equally among participants, then net balances are calculated. Debtors and creditors are sorted by descending balances and matched to produce payment instructions. Balances smaller than half a paisa are treated as settled; displayed payments are rounded to two decimal places.

Bundled input:

```python
expenses = [
    ("Akash", 900, ["Akash", "Neha", "Ravi"]),
    ("Neha", 300, ["Neha", "Ravi"]),
    ("Ravi", 600, ["Akash", "Neha", "Ravi", "Sam"]),
]
```

Output:

```text
Ravi is fully settled.
Neha pays Akash ₹300
Sam pays Akash ₹150
```

Amounts are expected to be valid non-negative numbers and participant lists must be non-empty. The implementation uses floating-point arithmetic and a greedy strategy; it does not guarantee the globally smallest number of transfers.

## Verification and scope

All three bundled examples were executed successfully and produced the documented outputs. There is no separate automated test suite. Sample code runs on import as well as direct execution, so these files are intended as exercise scripts.

This folder contains A1, A3 and A4. No A2 solution is present in the repository.

[Back to repository README](../README.md)
