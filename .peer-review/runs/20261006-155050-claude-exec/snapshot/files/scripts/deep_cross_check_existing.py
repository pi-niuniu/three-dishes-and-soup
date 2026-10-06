import json

with open('miniprogram/data/dishes.json') as f:
    existing_dishes = json.load(f)

with open('scratch/compliant_new_dishes.json') as f:
    candidates = json.load(f)

existing_dish_names = [d['name'] for d in existing_dishes]
print("All 75 existing dish names in miniprogram:")
for i, name in enumerate(existing_dish_names):
    print(f"{i+1}. {name}")

print("\nChecking if any candidate dish closely matches an existing dish...")
matches = []
for c in candidates:
    c_name = c['name']
    for ex in existing_dish_names:
        # Check exact or strong overlap
        if c_name == ex:
            matches.append((c_name, ex))
        elif len(c_name) >= 3 and len(ex) >= 3:
            # check core words
            core_c = c_name.replace('家常', '').replace('经典', '').replace('清炒', '').replace('蒜蓉', '').replace('老北京', '').replace('东北', '').replace('风味', '')
            core_ex = ex.replace('家常', '').replace('经典', '').replace('清炒', '').replace('蒜蓉', '').replace('老北京', '').replace('东北', '').replace('风味', '')
            if core_c == core_ex or (len(core_c) >= 4 and core_c in ex) or (len(core_ex) >= 4 and core_ex in c_name):
                matches.append((c_name, ex))

print(f"Potential overlaps found: {len(matches)}")
for c_name, ex in matches:
    print(f"Candidate: '{c_name}' <---> Existing: '{ex}'")

