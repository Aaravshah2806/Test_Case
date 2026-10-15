def pages(current, total) -> list:
    if current < 1 or current > total:
        raise ValueError("Current page must be between 1 and total.")

    # Identify the core pages that must always be shown
    required_pages = {1, total, current - 1, current, current + 1}
  # [1,3,4,5,7]
    
    # Filter out invalid pages (e.g., page 0) and sort them
    valid_pages = sorted(p for p in required_pages if 1 <= p <= total)
    
    result = []
    
    for page in valid_pages:
        if not result:
            result.append(page)
        else:
            gap = page - result[-1]
            if gap == 1:
                # Consecutive page
                result.append(page)
            elif gap == 2:
                # Exactly one page hidden, show the missing page instead of "…"
                result.append(page - 1)
                result.append(page)
            elif gap > 2:
                # More than one page hidden, show "…"
                result.append("…")
                result.append(page)
                
    return result
print(pages(4,7))