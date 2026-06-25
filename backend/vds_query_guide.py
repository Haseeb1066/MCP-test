VDS_QUERY_GUIDE = """
query-datasource requires datasourceLuid (UUID from list-datasources) and a query object with fields[] and optional filters[].

Rules:
- Use exact fieldCaption strings from list-published-datasource-fields (case-sensitive).
- Every filter needs filterType and field.fieldCaption.
- For "last year" when the current year is Y: prefer QUANTITATIVE_DATE on the date field with minDate Y-1-01-01 and maxDate Y-1-12-31 (not filterType YEAR alone).
- Start with limit 100 and 1–3 measures; add dimensions only after a simple query succeeds.
- If query-datasource errors, read the error text for required fields, fix filterType, and retry. Always call list-published-datasource-fields first if you have not yet.

Example — total for calendar last year (replace field captions after listing fields):
{
  "fields": [
    { "fieldCaption": "Performance", "function": "SUM", "fieldAlias": "Total" }
  ],
  "filters": [
    {
      "field": { "fieldCaption": "Report Date" },
      "filterType": "QUANTITATIVE_DATE",
      "quantitativeFilterType": "RANGE",
      "minDate": "2025-01-01",
      "maxDate": "2025-12-31"
    }
  ]
}

Relative "last year" alternative (anchor = Jan 1 of current year):
{
  "field": { "fieldCaption": "Report Date" },
  "filterType": "DATE",
  "periodType": "YEARS",
  "dateRangeType": "LAST",
  "rangeN": 1,
  "anchorDate": "2026-01-01"
}
""".strip()
