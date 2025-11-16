import json

# Load spice blends
with open('docs/spice_blends.json', 'r') as f:
    spice_blends = json.load(f)

# List of spices found in your data
data_spices = [
    "Blackening Spice",
    "Frank's Seasoning Blend",
    "Fry Seasoning",
    "Italian Seasoning",
    "Mexican Cheese Blend",
    "Mexican Spice Blend",
    "Shawarma Spice Blend",
    "Southwest Spice Blend",
    "Sweet Thai Heat Sauce",
    "Sweet and Smoky BBQ Seasoning",
    "Tunisian Spice Blend",
    "Tuscan Heat Spice"
]

print("Checking for matches:\n")
for spice in data_spices:
    if spice in spice_blends:
        print(f"✓ {spice} - FOUND")
    else:
        print(f"✗ {spice} - MISSING")
        # Check for partial matches
        for blend_name in spice_blends.keys():
            if spice.lower() in blend_name.lower() or blend_name.lower() in spice.lower():
                print(f"  → Possible match: {blend_name}")
