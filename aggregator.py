from collections import defaultdict
from fractions import Fraction

def aggregate_ingredients(ingredients):
    """
    Group by (ingredient, unit) and sum quantities.
    Returns a clean list with quantity + fraction display + 'amount'.
    """
    grouped = defaultdict(float)

    for ing in ingredients:
        name = (ing.get("ingredient") or "").strip().lower()
        unit = (ing.get("unit") or "").strip().lower()
        qty = ing.get("quantity")
        if name and unit and (qty is not None):
            grouped[(name, unit)] += float(qty)

    # Rebuild list with formatted fraction display
    result = []
    for (ingredient, unit), qty in grouped.items():
        frac = Fraction(qty).limit_denominator(8)
        if frac.denominator == 1:
            qty_display = str(frac.numerator)
        else:
            qty_display = f"{frac.numerator}/{frac.denominator}"

        result.append({
            "ingredient": ingredient.title(),
            "unit": unit,
            "quantity": float(qty),
            "quantity_display": qty_display,
            "amount": f"{qty_display} {unit}"
        })

    # Sort alphabetically for readability
    result.sort(key=lambda x: (x["ingredient"], x["unit"]))
    return result

