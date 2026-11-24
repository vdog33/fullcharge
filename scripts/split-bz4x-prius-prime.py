import json

PATH = 'src/data/fullcharge-data.json'
d = json.load(open(PATH))

BZ4X = {
    "id": "bz4x",
    "make": "Toyota",
    "model": "bZ4X",
    "years": "2023–present",
    "type": "BEV",
    "chemistry": "Lithium-ion",
    "chemistry_verified": True,
    "pack": "Li-ion BEV pack — check ERG for capacity",
    "cut_loop": "No Tesla-style loop. Main: power off, key fob 16+ ft away. Alternative: pull IGP-MAIN NO.1 fuse (30 A, green). Operate locks/windows/seats BEFORE disconnecting 12V.",
    "lv_location": "Confirm in the ERG / EVR app on scene",
    "no_cut_zones": "HV cables (blue/orange/yellow), airbag inflators, floor pack. Confirm in the ERG / EVR app on scene.",
    "airbag_hv": "Confirm in the ERG / EVR app on scene.",
    "tow": "Confirm in the ERG / EVR app on scene before the wheels turn.",
    "release": "Quarantine 50 ft from structures. TIC check before release: smoke, sound, rising temp. Escort the tow. Stranded energy lasts months — moving it can short + reignite.",
    "id_cues": [
        "Compact SUV with black fender cladding wrapping over wheel arches; closed nose with slim hammerhead lights; 'bZ4X' badge on rear"
    ],
    "erg_pdf_url": "https://api.rescue.euroncap.com/euro-rescue/rescue-documents/en/Toyota_bZ4X__SUV_2022_5d_Electric_EN.pdf",
    "erg_pdf_label": "Toyota bZ4X — Manufacturer Rescue Sheet via Euro NCAP (PDF)",
    "erg_verified_note": "Rescue sheet BZ4X10 v01, 03/2022 — HTTP 200 + application/pdf, verified live 2026-11-21.",
}

PRIUS_PRIME = {
    "id": "prius-prime",
    "make": "Toyota",
    "model": "Prius Prime",
    "years": "2023–present",
    "type": "PHEV",
    "chemistry": "Lithium-ion",
    "chemistry_verified": True,
    "pack": "Li-ion PHEV pack + 40 L gasoline tank",
    "cut_loop": "No Tesla-style loop. Main: power off, key fob 16+ ft away. Alternative: pull IGP-MAIN fuse (25 A, clear). Operate locks/windows/seats BEFORE disconnecting 12V.",
    "lv_location": "Confirm in the ERG / EVR app on scene",
    "no_cut_zones": "HV cables (blue/orange/yellow), airbag inflators, floor pack. Confirm in the ERG / EVR app on scene.",
    "airbag_hv": "No engine noise ≠ off — silent movement possible until fully shut down.",
    "tow": "Confirm in the ERG / EVR app on scene before the wheels turn.",
    "release": "Quarantine 50 ft from structures. TIC check before release: smoke, sound, rising temp. Escort the tow. Stranded energy lasts months — moving it can short + reignite.",
    "id_cues": [
        "Low wedge hatchback, plug door on rear fender — still has an HV pack",
        "5-door hatchback; 'PRIUS PRIME' badge on rear"
    ],
    "erg_pdf_url": "https://api.rescue.euroncap.com/euro-rescue/rescue-documents/en/Toyota_Prius_PHEV_SUV_2023_5d_Hybrid_EN.pdf",
    "erg_pdf_label": "Toyota Prius Prime / Prius PHEV — Manufacturer Rescue Sheet via Euro NCAP (PDF)",
    "erg_verified_note": "Rescue sheet PRIUSPHV61 v01, 03/2023 — HTTP 200 + application/pdf, verified live 2026-11-21.",
}

vehicles = d["vehicles"]
idx = next(i for i, v in enumerate(vehicles) if v["id"] == "bz4x-prius-prime")
vehicles[idx:idx + 1] = [BZ4X, PRIUS_PRIME]

vbs = d.get("verify_before_shipping", [])
d["verify_before_shipping"] = [
    ("Live-check all 20 manufacturer ERG PDF URLs in a real browser."
     if s.startswith("Live-check all 19") else s)
    for s in vbs
]
d["verify_before_shipping"] = [
    s for s in d["verify_before_shipping"]
    if not s.startswith("Split bZ4X")
]

with open(PATH, "w") as f:
    json.dump(d, f, indent=1, ensure_ascii=False)
    f.write("\n")

print("vehicles:", len(d["vehicles"]))
print("ids:", [v["id"] for v in d["vehicles"] if v["make"] == "Toyota"])
print("verify_before_shipping now has", len(d["verify_before_shipping"]), "items")
