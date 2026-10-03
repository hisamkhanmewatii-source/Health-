import React, { useState } from 'react';
import { FoodItem, RecipeItem } from '../../types';
import { INITIAL_RECIPES } from '../../utils/mockData';
import { calculateDaysLeft } from '../../utils/foodDatabase';
import { speakText } from '../../utils/voiceService';
import {
  ChefHat,
  Sparkles,
  Clock,
  Heart,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Flame,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PantryIngredientUsageChart } from './PantryIngredientUsageChart';
import { SupportedLanguage } from '../../utils/translations';

interface RecipeRecommenderProps {
  inventory: FoodItem[];
  onCookRecipe: (recipe: RecipeItem) => void;
  easyMode: boolean;
  filterIngredient?: string;
  onClearFilter?: () => void;
  currentLanguage?: SupportedLanguage;
}

export const RecipeRecommender: React.FC<RecipeRecommenderProps> = ({
  inventory,
  onCookRecipe,
  easyMode,
  filterIngredient,
  onClearFilter,
  currentLanguage = 'en',
}) => {
  const [recipes, setRecipes] = useState<RecipeItem[]>(INITIAL_RECIPES);
  const [activeRecipe, setActiveRecipe] = useState<RecipeItem>(INITIAL_RECIPES[0]);
  const [dietFilter, setDietFilter] = useState<string>('all');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Compute pantry match dynamically for each recipe
  const inventoryNames = inventory
    .filter((f) => !f.consumed)
    .map((f) => f.name.toLowerCase());

  const expiringPantryNames = inventory
    .filter((f) => !f.consumed && calculateDaysLeft(f.expirationDate) <= 2)
    .map((f) => f.name);

  const handleGenerateAIRecipe = async () => {
    setIsGeneratingAI(true);
    try {
      const activeFoods = inventory.filter((f) => !f.consumed).map((f) => f.name);
      const res = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: activeFoods,
          expiringItems: expiringPantryNames,
          dietaryPreference: dietFilter !== 'all' ? dietFilter : 'Healthy & Balanced',
          maxTimeMinutes: 25,
        }),
      });

      const data = await res.json();
      if (data.success && data.recipe) {
        const newRecipe: RecipeItem = {
          id: `ai-rec-${Date.now()}`,
          title: data.recipe.title || 'AI Healthy Pantry Creation',
          description: data.recipe.description || 'Custom crafted recipe using your pantry ingredients.',
          prepTime: data.recipe.prepTime || '10 mins',
          cookTime: data.recipe.cookTime || '15 mins',
          servings: data.recipe.servings || 2,
          difficulty: data.recipe.difficulty || 'Easy',
          caloriesPerServing: data.recipe.caloriesPerServing || 350,
          macros: data.recipe.macros || { protein: '25g', carbs: '30g', fat: '12g', fiber: '6g' },
          expiringItemsUsed: data.recipe.expiringItemsUsed || expiringPantryNames.slice(0, 2),
          ingredientsRequired: data.recipe.ingredientsRequired || [],
          pantryCoveragePercent: data.recipe.pantryCoveragePercent || 95,
          instructions: data.recipe.instructions || [],
          healthBenefits: data.recipe.healthBenefits || 'High in nutrients, balanced macros.',
          rotPreventionTip: data.recipe.rotPreventionTip || 'Cooks items before spoiling.',
          dietaryTags: ['AI Chef', 'Zero Waste Hero', 'Heart Healthy'],
        };

        setRecipes([newRecipe, ...recipes]);
        setActiveRecipe(newRecipe);
        speakText(`Generated a new healthy recipe: ${newRecipe.title}. Ready in ${newRecipe.cookTime}!`);
      }
    } catch (e) {
      console.warn('AI recipe generation error:', e);
    }
    setIsGeneratingAI(false);
  };

  const handleCook = (rec: RecipeItem) => {
    confetti({
      particleCount: 60,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#10b981', '#f59e0b', '#3b82f6'],
    });

    // Save meal cooking record to localStorage for pantry usage analytics
    try {
      const stored = localStorage.getItem('mohammed_hisam_cooking_history');
      const history = stored ? JSON.parse(stored) : [];
      const newRecord = {
        id: `cm-${Date.now()}`,
        recipeTitle: rec.title,
        cookedDate: new Date().toISOString().split('T')[0],
        ingredientsUsed: rec.ingredientsRequired.map((i) => i.name),
        category: 'produce',
        preventedRot: Boolean(rec.expiringItemsUsed && rec.expiringItemsUsed.length > 0),
        calories: rec.caloriesPerServing,
      };
      localStorage.setItem('mohammed_hisam_cooking_history', JSON.stringify([newRecord, ...history]));
    } catch (e) {
      console.warn('Failed to record cooked meal history:', e);
    }

    onCookRecipe(rec);
    speakText(`Wonderful! You cooked ${rec.title}. Ingredients have been updated in your pantry.`);
  };

  const handleSpeakSteps = (rec: RecipeItem) => {
    let text = `Recipe for ${rec.title}. `;
    text += `Ingredients: ${rec.ingredientsRequired.map((i) => `${i.amount} of ${i.name}`).join(', ')}. `;
    text += `Instructions: `;
    rec.instructions.forEach((step, idx) => {
      text += `Step ${idx + 1}: ${step}. `;
    });
    speakText(text);
  };

  const filteredRecipes = recipes.filter((r) => {
    if (filterIngredient) {
      const match =
        r.expiringItemsUsed.some((i) => i.toLowerCase().includes(filterIngredient.toLowerCase())) ||
        r.ingredientsRequired.some((i) => i.name.toLowerCase().includes(filterIngredient.toLowerCase()));
      if (!match) return false;
    }
    if (dietFilter !== 'all') {
      return r.dietaryTags?.includes(dietFilter);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              Healthy Pantry Recipes
            </h1>
            <p className="text-xs sm:text-sm text-slate-700">
              Personalized meals made exclusively from ingredients currently in your kitchen
            </p>
          </div>
        </div>

        <button
          disabled={isGeneratingAI}
          onClick={handleGenerateAIRecipe}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-amber-200" />
          <span>{isGeneratingAI ? 'Chef Thinking...' : 'AI Chef: Generate with Expiring Foods'}</span>
        </button>
      </div>

      {/* Filter ingredient banner if redirected from a specific food card */}
      {filterIngredient && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-bold text-teal-900">
            🔍 Showing recipes using: <strong className="text-teal-700">{filterIngredient}</strong>
          </span>
          {onClearFilter && (
            <button
              onClick={onClearFilter}
              className="text-xs text-teal-700 hover:underline font-bold"
            >
              Clear Filter
            </button>
          )}
        </div>
      )}

      {/* Main Layout: Recipe List & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recipe Selection Cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 px-1">
            Available Recipes ({filteredRecipes.length})
          </h3>

          {filteredRecipes.map((rec) => {
            const isSelected = activeRecipe.id === rec.id;
            return (
              <div
                key={rec.id}
                onClick={() => setActiveRecipe(rec)}
                className={`p-4 rounded-2xl border cursor-pointer transition text-left ${
                  isSelected
                    ? 'bg-amber-50/70 border-amber-500 shadow-md ring-2 ring-amber-400/20'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                    {rec.title}
                  </h4>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                    {rec.pantryCoveragePercent}% In Pantry
                  </span>
                </div>

                <p className="text-xs text-slate-700 mt-1 line-clamp-2">
                  {rec.description}
                </p>

                <div className="mt-3 flex items-center gap-3 text-xs text-slate-600 font-semibold">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-600" />
                    {rec.prepTime} prep + {rec.cookTime} cook
                  </span>
                  <span>🔥 {rec.caloriesPerServing} kcal</span>
                </div>

                {/* Rescued expiring tags */}
                {rec.expiringItemsUsed.length > 0 && (
                  <div className="mt-2 text-[11px] font-bold text-orange-800 bg-orange-100/60 px-2 py-0.5 rounded-md inline-block">
                    🛡️ Rescues: {rec.expiringItemsUsed.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Detailed Recipe View */}
        <div className="lg:col-span-2">
          {activeRecipe ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-5 sm:p-6 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-xs uppercase tracking-wider">
                      Healthy Recipe
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-xs">
                      ✅ {activeRecipe.pantryCoveragePercent}% Pantry Ready
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    {activeRecipe.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-700 mt-1">
                    {activeRecipe.description}
                  </p>
                </div>

                <button
                  onClick={() => handleSpeakSteps(activeRecipe)}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shrink-0"
                >
                  <Volume2 className="w-4 h-4 text-amber-600 animate-bounce" />
                  <span>🔊 Read Steps</span>
                </button>
              </div>

              {/* Time & Macros quick bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Time
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-800">
                    {activeRecipe.prepTime} + {activeRecipe.cookTime}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Calories
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-800">
                    {activeRecipe.caloriesPerServing} kcal
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Protein
                  </span>
                  <span className="text-xs sm:text-sm font-black text-emerald-800">
                    {activeRecipe.macros.protein}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Fiber
                  </span>
                  <span className="text-xs sm:text-sm font-black text-teal-800">
                    {activeRecipe.macros.fiber}
                  </span>
                </div>
              </div>

              {/* Ingredients List */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2.5">
                  Ingredients Needed (From Your Pantry)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeRecipe.ingredientsRequired.map((ing, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-slate-800">{ing.name}</span>
                      </div>
                      <span className="text-slate-700 font-semibold">{ing.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Numbered Step-by-Step Cooking Instructions */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2.5">
                  Easy Step-by-Step Instructions
                </h3>
                <div className="space-y-2.5">
                  {activeRecipe.instructions.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-amber-50/40 rounded-xl border border-amber-100"
                    >
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Benefits & Rot Prevention callout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                  <strong className="block font-black mb-0.5">🌱 Health & Nutrition Benefit:</strong>
                  <span>{activeRecipe.healthBenefits}</span>
                </div>
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-orange-900">
                  <strong className="block font-black mb-0.5">🛡️ Food Rot Prevention:</strong>
                  <span>{activeRecipe.rotPreventionTip}</span>
                </div>
              </div>

              {/* Cooked this button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => handleCook(activeRecipe)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>I Cooked This Recipe!</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* NEW SECTION: Frequently Cooked Healthy Meal Ingredients (Visualized with Recharts) */}
      <PantryIngredientUsageChart
        inventory={inventory}
        currentLanguage={currentLanguage}
        onFilterByIngredient={(ing) => {
          if (filterIngredient?.toLowerCase() === ing.toLowerCase()) {
            if (onClearFilter) onClearFilter();
          } else {
            // Find recipe with this ingredient and smoothly scroll to the recipes list
            const matched = recipes.find(
              (r) =>
                r.ingredientsRequired.some((i) => i.name.toLowerCase().includes(ing.toLowerCase())) ||
                r.expiringItemsUsed.some((e) => e.toLowerCase().includes(ing.toLowerCase()))
            );
            if (matched) {
              setActiveRecipe(matched);
            }
            window.scrollTo({ top: 180, behavior: 'smooth' });
          }
        }}
      />
    </div>
  );
};
