"""
ECHOES ON THE THRESHOLD — app.py
Flask Backend · CSE 358 AI Project

AI PIPELINE:
  1. Groq API → Llama-3.1-8b → poem (Dylan/Cohen style, inspired by the journey)
  2. Flask serves the poem → frontend displays + reads aloud via SpeechSynthesis

HOW TO RUN:
  pip install -r requirements.txt
  python app.py
  → http://localhost:5000
"""

import os
import json
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ── API KEY ───────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")  # set via environment variable

# ── DOOR METADATA ─────────────────────────────────────────────────────────────
DOOR_SYMBOLS = {
    0: "Moon  (longing & the abyss)",
    1: "Flame (rage & transformation)",
    2: "Feather (release & acceptance)",
    3: "Key   (memory & the locked past)",
}

# ── LLM: GROQ + LLAMA-3.1 ────────────────────────────────────────────────────
def generate_with_llm(choices: list) -> dict:
    """
    Sends the user's 3 door choices + NLP similarity scores to Groq (Llama 3.1).

    The NLP scores (not just the winning door) are passed so the LLM can feel
    the full emotional weight of each answer — e.g. 72% longing / 18% rage
    produces a different poem than 51% longing / 44% rage.

    Historical grounding: Dylan wrote 'Knockin' on Heaven's Door' for a dying
    sheriff in Pat Garrett & Billy the Kid (1973), during the Vietnam War.
    The LLM prompt carries this specific era and context.
    """
    journey_lines = []
    for c in choices:
        # Build a rich NLP score line if scores are available
        scores = c.get("scores")  # dict: {Moon: 0.72, Flame: 0.18, ...}
        if scores:
            score_str = "  |  ".join(
                f"{k} {round(v*100)}%" for k, v in scores.items()
            )
            journey_lines.append(
                f"  Round {c['round']}: \"{c['answer']}\"\n"
                f"    Soul resonance → {score_str}"
            )
        else:
            door_label = DOOR_SYMBOLS.get(c.get("door_index", 0), "Unknown")
            journey_lines.append(
                f"  Round {c['round']}: \"{c['answer']}\"  →  {door_label}"
            )
    journey_text = "\n".join(journey_lines)

    system_prompt = (
        "You are a poet in the tradition of Bob Dylan — spare, elemental, honest.\n\n"

        "HISTORICAL CONTEXT YOU MUST EMBODY:\n"
        "Dylan wrote 'Knockin' on Heaven's Door' in 1973 for the film "
        "'Pat Garrett & Billy the Kid' (dir. Sam Peckinpah). A sheriff, "
        "shot and dying, speaks his last words. This is the Vietnam War era: "
        "young men dying in a war that felt purposeless, a generation asking "
        "whether any of it meant anything. The counterculture was fading. "
        "The song is about laying down your weapons — not in defeat, but in "
        "release. The badge, the gun, the burden of identity. Letting go.\n\n"

        "YOUR TASK:\n"
        "Read the soul's journey below. Each answer has NLP similarity scores "
        "showing the emotional pull toward each symbolic door. Use these scores "
        "as an emotional map — not just the winner, but the full weight distribution.\n\n"

        "Write a poem (2 stanzas, 3-4 lines each) that:\n"
        "- Channels Dylan's 1973 voice: sparse, no decoration, no clichés\n"
        "- Carries the specific era: farewell, burden, the weight of what was carried\n"
        "- Speaks directly to this soul using 'you'\n"
        "- Reflects the FULL emotional map (not just the dominant door)\n"
        "- Ends with a line that opens rather than closes — a door, not a wall\n"
        "Use \\n for line breaks within stanzas, \\n\\n between stanzas.\n\n"

        "Respond ONLY with valid JSON: { \"poem\": \"...\" }"
    )

    user_message = (
        f"Here is the soul's journey through the threshold:\n\n"
        f"{journey_text}\n\n"
        "Write the poem."
    )

    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type":  "application/json",
        },
        json={
            "model":       "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.92,
            "max_tokens":  500,
        },
        timeout=30,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"Groq API {resp.status_code}: {resp.text}")

    data = json.loads(resp.json()["choices"][0]["message"]["content"])
    return {
        "poem":  data.get("poem",  "Some echoes never reach the door they came from."),
        "scene": data.get("scene", "A lone figure standing in a dark doorway, candlelight, fog"),
    }


# ── FLASK ROUTES ──────────────────────────────────────────────────────────────
@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(".", path)


@app.route("/generate", methods=["POST"])
def generate():
    """
    Request:  { "choices": [{round, door_index, door_symbol, answer}, ...] }
    Response: { "poem": "..." }
    """
    data    = request.get_json(force=True)
    choices = data.get("choices", [])

    if len(choices) != 3:
        return jsonify({"error": "Exactly 3 choices required"}), 400

    try:
        result = generate_with_llm(choices)
        return jsonify({"poem": result["poem"], "scene": result.get("scene", "")})

    except Exception as exc:
        app.logger.error("Generation failed: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ── ENTRY POINT ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n  ECHOES ON THE THRESHOLD — Backend Running")
    print("  Open: http://localhost:5000\n")
    app.run(debug=True, port=5000)
