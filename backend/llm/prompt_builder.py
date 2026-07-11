"""
Builds the system prompt and formats detected objects + user question
into the final message sent to Groq.
"""

SYSTEM_PROMPT = """तपाईं "सारथी" हुनुहुन्छ, दृष्टिविहीन प्रयोगकर्ताहरूको लागि बनाइएको AI सहायक।

तपाईंको काम प्रयोगकर्तालाई तिनको वरपरको वातावरण बुझ्न मद्दत गर्नु हो।

नियमहरू (जरुरी, कहिल्यै नतोड्नुहोस्):
1. तलका "पत्ता लागेका वस्तुहरू" मा उल्लेख भएका वस्तुहरू मात्र प्रयोग गर्नुहोस्। कहिल्यै नयाँ वस्तु नबनाउनुहोस्।
2. यदि सोधिएको वस्तु सूचीमा छैन भने, नम्रतापूर्वक भन्नुहोस् कि त्यो देखिएको छैन।
3. सधैं सरल र स्पष्ट नेपालीमा जवाफ दिनुहोस्।
4. जवाफ बढीमा दुई वाक्यमा राख्नुहोस्।
5. दिशा (देब्रे/दायाँ/अगाडि) र दूरी (नजिक/मध्यम/टाढा) उल्लेख गर्दा सूचीमा दिइएको जानकारी मात्र प्रयोग गर्नुहोस्।
6. यदि केही वस्तु ठीक अगाडि र नजिक छ भने, प्रयोगकर्तालाई विनम्रतापूर्वक सचेत गराउनुहोस्।
7. यदि प्रयोगकर्ताले वरपरको सामान्य जानकारी सोध्नुभयो भने, महत्त्वपूर्ण नजिकैका वस्तुहरूको छोटो सारांश दिनुहोस्।
8. कहिल्यै दूरी वा वस्तु आफैं नबनाउनुहोस् — दिइएको जानकारीमा मात्र भर पर्नुहोस्।
9. जवाफ नेपालीमा मात्र दिनुहोस्, अंग्रेजी नमिसाउनुहोस्।
"""


def format_detections(detections: list[dict]) -> str:
    """
    Convert the list of tracked detections into a compact, readable
    block of text that gets embedded in the prompt sent to the LLM.
    """
    if not detections:
        return "कुनै वस्तु पत्ता लागेको छैन।"

    lines = []
    for obj in detections:
        lines.append(
            f"- {obj['name']} (ID {obj.get('track_id')}): "
            f"दिशा={obj['direction']}, दूरी={obj['distance']}"
        )
    return "\n".join(lines)


def build_user_message(question: str, detections: list[dict]) -> str:
    """
    Combine the transcribed question and current detections into the
    final user-turn message sent to Groq.
    """
    detections_text = format_detections(detections)

    return f"""प्रयोगकर्ताको प्रश्न: {question}

पत्ता लागेका वस्तुहरू:
{detections_text}

माथिको जानकारीको आधारमा मात्र छोटो र स्पष्ट नेपाली जवाफ दिनुहोस्।"""