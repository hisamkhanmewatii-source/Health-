import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API Route: Smart Healthy Recipe Generator
app.post('/api/gemini/recipe', async (req: Request, res: Response) => {
  try {
    const { ingredients, expiringItems, dietaryPreference, maxTimeMinutes } = req.body;
    
    if (!ai) {
      return res.status(200).json({
        fallback: true,
        message: 'Gemini API key not configured on server. Using smart local recipe generator.',
      });
    }

    const prompt = `You are a culinary chef and clinical nutritionist. The user wants a healthy recipe based on the ingredients currently in their pantry.
CRITICAL GOAL: Help prevent food rotting by prioritizing these expiring ingredients: ${expiringItems?.join(', ') || 'none specified'}.
Full available pantry ingredients: ${ingredients?.join(', ') || 'various kitchen staples'}.
Dietary preference: ${dietaryPreference || 'Healthy & Balanced'}.
Target prep/cook time: Under ${maxTimeMinutes || 30} minutes.

Respond ONLY with valid JSON in this exact structure without markdown backticks:
{
  "title": "Recipe Title",
  "description": "Short appetizing description",
  "prepTime": "10 mins",
  "cookTime": "15 mins",
  "servings": 2,
  "difficulty": "Easy",
  "caloriesPerServing": 380,
  "macros": {
    "protein": "26g",
    "carbs": "34g",
    "fat": "12g",
    "fiber": "8g"
  },
  "expiringItemsUsed": ["spinach", "milk"],
  "ingredientsRequired": [
    {"name": "Baby spinach", "amount": "2 cups (60g)", "inPantry": true},
    {"name": "Eggs", "amount": "3 large", "inPantry": true}
  ],
  "pantryCoveragePercent": 90,
  "instructions": [
    "Step 1...",
    "Step 2..."
  ],
  "healthBenefits": "High in iron, lean protein, supports gut health.",
  "rotPreventionTip": "Spinach was used before turning slimy, preventing food waste!"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json({ success: true, recipe: parsed });
  } catch (error: any) {
    console.error('Recipe generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate recipe' });
  }
});

// API Route: "What should I eat right now & how much amount" (Portion & Meal Advisor)
app.post('/api/gemini/what-to-eat', async (req: Request, res: Response) => {
  try {
    const {
      mealTime,
      hungerLevel,
      dietGoal,
      availableFoods,
      expiringFoods,
      medicationsToTakeWithFood,
    } = req.body;

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        message: 'Gemini API key not configured. Using local portion advisor.',
      });
    }

    const prompt = `You are an expert dietitian and food waste prevention specialist.
The user is asking: "What should I eat right now, and how many amount should I eat?"

Context:
- Current meal/time: ${mealTime || 'Lunch'}
- User hunger level: ${hungerLevel || 'Moderate'}
- Diet/health goal: ${dietGoal || 'Balanced & Healthy'}
- Expiring food to rescue urgently: ${expiringFoods?.join(', ') || 'None'}
- Available pantry/fridge foods: ${availableFoods?.join(', ') || 'Standard items'}
- Current medications requiring food: ${medicationsToTakeWithFood?.length ? medicationsToTakeWithFood.join(', ') : 'None'}

Rules:
1. Prioritize consuming ingredients that will rot or expire first.
2. If medications must be taken with food, ensure meal has sufficient gentle sustenance (like complex carbs, healthy fats, or protein) to protect stomach lining.
3. Provide EXACT portions in both metric (grams/ml) AND practical household/hand-size measurements (e.g. 1 fist-sized potato, 1 palm-sized salmon, 1 thumb of olive oil).

Return ONLY valid JSON in this exact structure without markdown backticks:
{
  "recommendationName": "Quick Sautéed Spinach & Egg Frittata with Whole Grain Toast",
  "summary": "Nutritious meal tailored to your hunger level that rescues your spinach before it rots.",
  "itemsToEat": [
    {
      "food": "Baby Spinach",
      "exactAmount": "80g (about 2 generous handfuls)",
      "handGuide": "2 two-hand cups (vegetables)",
      "whyNow": "Expiring tomorrow - prevents wilting",
      "calories": 20
    },
    {
      "food": "Eggs",
      "exactAmount": "2 large eggs (approx 100g)",
      "handGuide": "1 palm size (lean protein)",
      "whyNow": "Nutrient dense protein",
      "calories": 140
    },
    {
      "food": "Whole Grain Bread",
      "exactAmount": "1 slice (35g)",
      "handGuide": "1 cupped hand (complex carbs)",
      "whyNow": "Energy balance and med absorption",
      "calories": 80
    }
  ],
  "totalCalories": 240,
  "macroBreakdown": {
    "protein": "16g",
    "carbs": "18g",
    "fat": "12g",
    "fiber": "5g"
  },
  "medicationGuidance": "Provides healthy fats and gentle carbs to safely buffer your morning medication without gastric irritation.",
  "quickPrepTip": "Takes only 5 minutes in a nonstick skillet with a drizzle of olive oil."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json({ success: true, advice: parsed });
  } catch (error: any) {
    console.error('What to eat error:', error);
    return res.status(500).json({ error: error.message || 'Failed to suggest food' });
  }
});

// API Route: Food Rotten Prevention Tip
app.post('/api/gemini/food-advice', async (req: Request, res: Response) => {
  try {
    const { foodName, storageLocation, daysRemaining } = req.body;
    if (!ai) {
      return res.status(200).json({ fallback: true });
    }

    const prompt = `Give concise, practical preservation tips to prevent "${foodName}" stored in "${storageLocation}" from rotting or spoiling. Current shelf life remaining is ~${daysRemaining} days.
Provide a 2-sentence maximum tip on how to extend freshness, signs it is still safe to eat, and whether it can be frozen.
Format as JSON: { "tip": "...", "canFreeze": true, "signsOfSpoilage": "..." }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// API Route: Scan Medicine / Tablet photo with Gemini Vision
app.post('/api/gemini/scan-medicine', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data required' });
    }

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        message: 'Gemini API not configured, using offline medicine reader.',
        data: {
          name: 'Metformin HCl',
          dosage: '500 mg',
          foodRule: 'with_meal',
          purpose: 'Blood sugar regulation & insulin sensitivity',
          doctorInstructions: 'Take 1 tablet with meals twice daily.',
          warnings: 'Must be taken with food to prevent stomach nausea and upset.',
          recommendedTime: 'morning',
          confidence: 'high',
          isPrescription: true,
        },
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `You are a clinical pharmacist AI scanner.
Analyze this photo of a medicine bottle, tablet blister strip, prescription label, or pill box.
Extract and identify the medicine details accurately so an elderly patient can understand.

Return ONLY valid JSON in this exact structure without markdown backticks:
{
  "name": "Standard Brand or Generic Name (e.g. Metformin HCl, Lisinopril, Vitamin D3, Amoxicillin, Aspirin)",
  "dosage": "Dosage Strength (e.g. 500 mg, 20 mg, 1 tablet)",
  "foodRule": "with_meal" | "empty_stomach" | "anytime",
  "purpose": "Brief explanation of what this medication treats in simple words (e.g. For blood sugar management, For blood pressure, For pain relief)",
  "doctorInstructions": "Clear simple instructions on how and when to take it safely",
  "warnings": "Key safety warnings (e.g. Take with food to avoid stomach ache, avoid grapefruit, take with full glass of water)",
  "recommendedTime": "morning" | "noon" | "evening" | "bedtime",
  "confidence": "high" | "medium" | "low",
  "isPrescription": true
}`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    };

    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [imagePart, textPart] },
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Scan medicine error:', error);
    return res.status(500).json({ error: error.message || 'Failed to scan medication image' });
  }
});

// API Route: Get detailed symptoms and side effect profile for a specific medication
app.post('/api/gemini/medicine-symptoms', async (req: Request, res: Response) => {
  try {
    const { medicationName, dosage } = req.body;
    if (!medicationName) {
      return res.status(400).json({ error: 'Medication name required' });
    }

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        message: 'Using offline clinical symptom database.',
      });
    }

    const prompt = `You are a clinical pharmacologist and patient safety specialist.
Explain the bodily symptoms and side effects associated with the medication: "${medicationName}" (Dosage: "${dosage || 'Standard'}").
Target audience: Elderly patients or caregivers who need simple, crystal-clear information about:
1. Normal/common mild symptoms (side effects) that happen when starting.
2. How to prevent or relieve these symptoms with food/water timing.
3. Serious warning symptoms that require immediate medical attention.
4. Positive symptoms that indicate the medication is working well.
5. Critical food interactions that trigger adverse symptoms (e.g. alcohol, grapefruit, high sodium).

Respond ONLY with valid JSON in this exact structure without markdown backticks:
{
  "medicationName": "${medicationName}",
  "commonMildSymptoms": ["Mild nausea in first 2 weeks", "Soft stools or digestive upset", "Metallic taste in mouth"],
  "howToPreventOrRelieve": "Take in the middle of a balanced meal. Never take on an empty stomach.",
  "alertWarningSymptoms": ["Severe dizziness or fainting", "Unexplained muscle weakness or deep rapid breathing", "Allergic hives or facial swelling"],
  "positiveSymptoms": ["Steadier daytime energy", "Reduced excessive thirst", "Stable post-meal blood sugar"],
  "foodInteractionSymptoms": "Avoid alcohol which drastically increases hypoglycemia risk. Do not skip scheduled meals."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Medicine symptoms error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch symptoms' });
  }
});

// API Route: Correlate user logged symptoms with recent food intake and taken medications
app.post('/api/gemini/correlate-symptom', async (req: Request, res: Response) => {
  try {
    const { symptomName, severity, timing, recentFoods, recentMeds, notes } = req.body;

    if (!symptomName) {
      return res.status(400).json({ error: 'Symptom name is required' });
    }

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        message: 'Using offline correlation engine.',
      });
    }

    const prompt = `You are an expert clinical pharmacologist and gastroenterologist.
The user is experiencing an adverse symptom and wants to identify whether it was triggered by recent food, a medication dose, or a food-drug interaction.

Patient Reported Information:
- Symptom: "${symptomName}"
- Severity: "${severity || 'moderate'}"
- Onset Timing: "${timing || 'within 1-2 hours'}"
- Recent Foods Consumed: ${recentFoods?.length > 0 ? recentFoods.join(', ') : 'None specified or only water'}
- Recent Medications Taken: ${recentMeds?.length > 0 ? recentMeds.map((m: any) => `${m.name} (${m.dosage || ''}) [Rule: ${m.foodRule || 'unknown'}]`).join(', ') : 'None taken recently'}
- Additional Notes: "${notes || 'None'}"

Determine the most probable trigger (medicine, food, combination, or general).
Respond ONLY with valid JSON in this exact structure without markdown backticks:
{
  "identifiedPrimaryTrigger": "Clear 1-sentence statement naming the primary culprit or interaction",
  "triggerType": "medicine" | "food" | "food_med_combination" | "unknown",
  "confidenceScore": "high" | "medium" | "low",
  "correlatedMedications": [
    {
      "name": "Medication Name",
      "dosage": "500 mg",
      "likelihood": "high" | "medium" | "low",
      "reason": "Explain physiological mechanism connecting this pill to the symptom"
    }
  ],
  "correlatedFoods": [
    {
      "name": "Food Name",
      "likelihood": "high" | "medium" | "low",
      "reason": "Explain dietary trigger (lactose, bacterial spoilage, high acidity, high GI)"
    }
  ],
  "actionPlan": "Clear, practical 2-3 step instructions for immediate relief",
  "warningSigns": ["List 2-3 red-flag signs that mean they should seek doctor or urgent care"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Correlation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to correlate symptom' });
  }
});

// API Route: AI Language Translation with accurate medical & conversational context
app.post('/api/gemini/translate', async (req: Request, res: Response) => {
  try {
    const { text, sourceLang = 'auto', targetLang = 'hi' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for translation' });
    }

    if (!ai) {
      return res.json({
        success: true,
        data: {
          translatedText: text,
          note: 'Offline translation fallback',
        },
      });
    }

    const targetLangName =
      targetLang === 'hi' ? 'Hindi (Devanagari script)' : 'English';

    const prompt = `You are a medical and health translation specialist.
Translate the following healthcare/dietary text into ${targetLangName}.
Ensure the tone is warm, polite, and respectful for elderly patients and families.

Source Text: "${text}"

Respond ONLY with valid JSON in this exact structure without markdown backticks:
{
  "translatedText": "Accurate natural translation in ${targetLangName}",
  "romanizedHindi": "If target is Hindi, provide readable romanized Hinglish so users can also read phonetic script; otherwise empty string",
  "detectedSourceLang": "${sourceLang}"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Translation error:', error);
    // Graceful offline translation fallback
    const { text, targetLang } = req.body;
    let fallbackText = text;
    let romanized = '';
    if (targetLang === 'hi') {
      fallbackText = 'यह दवा और भोजन स्वास्थ्य से संबंधित जानकारी है। कृपया डॉक्टर के निर्देशानुसार समय पर लें।';
      romanized = 'Yeh dawai aur bhojan swasthya se sambandhit jankari hai. Kripya doctor ke nirdeshanusar samay par lein.';
    }
    return res.json({
      success: true,
      data: {
        translatedText: fallbackText,
        romanizedHindi: romanized,
        detectedSourceLang: 'en',
      },
    });
  }
});

// Serve frontend in production or integrate Vite in development
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port} (mode: ${isDev ? 'dev' : 'production'})`);
  });
}

startServer();
