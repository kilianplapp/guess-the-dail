"""
Fetch Irish Dáil (TD) data for Guess the Dáil game.
Uses Oireachtas API for member info and built-in photo endpoints.
"""

import requests
import json

OUTPUT_FILE = "candidates.json"

OIREACHTAS_API = "https://api.oireachtas.ie/v1/members"
OIREACHTAS_IMAGE_BASE = "https://data.oireachtas.ie/ie/oireachtas/member/id/{member_code}/image/large"

# Map raw party names to display names (top 5 Dáil parties)
PARTY_MAP = {
    "Fianna Fáil": "Fianna Fáil",
    "Fianna_Fáil": "Fianna Fáil",
    "Fine Gael": "Fine Gael",
    "Fine_Gael": "Fine Gael",
    "Sinn Féin": "Sinn Féin",
    "Sinn_Féin": "Sinn Féin",
    "Labour Party": "Labour",
    "Labour_Party": "Labour",
    "Social Democrats": "Social Democrats",
    "Social_Democrats": "Social Democrats",
}

MAIN_PARTIES = [
    "Fianna Fáil",
    "Fine Gael",
    "Sinn Féin",
    "Labour",
    "Social Democrats",
]


def get_party_display(raw_party):
    return PARTY_MAP.get(raw_party, raw_party)


def fetch_tds_from_oireachtas():
    """Fetch all current TDs from the Oireachtas API."""
    params = {
        "member_type": "dail",
        "date_start": "2024-11-29",
        "limit": 250,
    }
    resp = requests.get(OIREACHTAS_API, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    tds = []
    for result in data.get("results", []):
        member = result.get("member", {})
        full_name = member.get("fullName", "")
        member_code = member.get("memberCode", "")
        member_uri = member.get("uri", "")

        # Extract member ID from URI
        member_id = member_uri.split("/id/", 1)[1] if "/id/" in member_uri else member_code

        # Get current party from most recent Dail membership
        party = None
        for membership in member.get("memberships", []):
            ms = membership.get("membership", {})
            house = ms.get("house", {})
            if house.get("houseCode") == "dail":
                house_no = house.get("houseNo", "")
                if house_no in ("34", "33"):
                    parties = ms.get("parties", [])
                    if parties:
                        p = parties[0].get("party", {})
                        party = p.get("showAs", "")
                    break

        if not full_name or not party:
            continue

        display_party = get_party_display(party)
        image_url = OIREACHTAS_IMAGE_BASE.format(member_code=member_id)

        tds.append({
            "id": member_code,
            "name": full_name,
            "party": display_party,
            "image_src": image_url,
        })

    return tds


def main():
    print("Fetching TDs from Oireachtas API...")
    tds = fetch_tds_from_oireachtas()
    print(f"Fetched {len(tds)} TDs total")

    # Filter to main parties
    candidates = [td for td in tds if td["party"] in MAIN_PARTIES]
    print(f"After filtering to main parties: {len(candidates)}")

    # Show breakdown
    party_counts = {}
    for c in candidates:
        party_counts[c["party"]] = party_counts.get(c["party"], 0) + 1

    for p in MAIN_PARTIES:
        if p in party_counts:
            print(f"  {p}: {party_counts[p]}")

    # Count TDs in other parties
    others = [td for td in tds if td["party"] not in MAIN_PARTIES]
    if others:
        other_parties = set(td["party"] for td in others)
        print(f"\nOther parties ({len(others)} TDs): {other_parties}")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(candidates, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(candidates)} candidates to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
