import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  CheckCircle2,
  Calendar,
  Sparkles,
  Volume2,
  AlertCircle,
  Clock,
  Pill,
  Leaf,
  ChevronRight,
  Flame,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Medication, TimeOfDay, ReminderCategory } from '../../types';
import { SupportedLanguage } from '../../utils/translations';
import { speakText } from '../../utils/voiceService';
import { addDaysToDate, getTodayDateString } from '../../utils/foodDatabase';

interface MedicationAdherenceChartProps {
  medications: Medication[];
  todayDateStr: string;
  currentLanguage?: SupportedLanguage;
  easyMode?: boolean;
  onToggleTaken?: (medId: string, slot: TimeOfDay) => void;
}

export interface DayAdherenceData {
  dateStr: string;
  dayShort: string; // "Mon", "Tue"
  dayNumber: string; // "Oct 2"
  fullLabel: string; // "Monday, Oct 2"
  takenCount: number;
  totalExpected: number;
  rate: number; // 0 to 100
  isToday: boolean;
  isFuture: boolean;
  details: Array<{
    medId: string;
    medName: string;
    category?: ReminderCategory;
    slot: TimeOfDay;
    dosage: string;
    isTaken: boolean;
  }>;
}

export const MedicationAdherenceChart: React.FC<MedicationAdherenceChartProps> = ({
  medications,
  todayDateStr,
  currentLanguage = 'en',
  easyMode = false,
  onToggleTaken,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'medication' | 'supplement'>('all');
  const [timeframe, setTimeframe] = useState<'current_week' | 'rolling_7'>('current_week');
  const [selectedDayDate, setSelectedDayDate] = useState<string>(todayDateStr);

  // Filter medications based on user's selection
  const relevantMeds = useMemo(() => {
    return medications.filter((m) => {
      if (filterType === 'all') return true;
      return (m.category || 'medication') === filterType;
    });
  }, [medications, filterType]);

  // Compute the 7 days for the chart
  const weekDays = useMemo(() => {
    const today = new Date(todayDateStr + 'T00:00:00');

    if (timeframe === 'rolling_7') {
      // Past 7 days ending with today (today-6 to today)
      const list: string[] = [];
      for (let i = 6; i >= 0; i--) {
        list.push(addDaysToDate(todayDateStr, -i));
      }
      return list;
    }

    // Current calendar week (Monday to Sunday)
    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      list.push(d.toISOString().split('T')[0]);
    }
    return list;
  }, [todayDateStr, timeframe]);

  // Build chart dataset
  const chartData: DayAdherenceData[] = useMemo(() => {
    const daysLocale = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';

    return weekDays.map((dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      const isToday = dateStr === todayDateStr;
      const isFuture = dateStr > todayDateStr;

      const dayShort = new Intl.DateTimeFormat(daysLocale, { weekday: 'short' }).format(d);
      const dayNumber = new Intl.DateTimeFormat(daysLocale, { month: 'short', day: 'numeric' }).format(d);
      const fullLabel = new Intl.DateTimeFormat(daysLocale, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }).format(d);

      let takenCount = 0;
      let totalExpected = 0;
      const details: DayAdherenceData['details'] = [];

      relevantMeds.forEach((med) => {
        const dayHistory = med.history?.[dateStr] || {};
        med.times.forEach((slot) => {
          totalExpected++;
          const isTaken = !!dayHistory[slot];
          if (isTaken) {
            takenCount++;
          }
          details.push({
            medId: med.id,
            medName: med.name,
            category: med.category,
            slot,
            dosage: med.dosage,
            isTaken,
          });
        });
      });

      // Calculate adherence percentage
      let rate = 0;
      if (totalExpected > 0) {
        rate = Math.min(100, Math.round((takenCount / totalExpected) * 100));
      } else {
        rate = 100;
      }

      return {
        dateStr,
        dayShort,
        dayNumber,
        fullLabel,
        takenCount,
        totalExpected,
        rate: isFuture ? 0 : rate,
        isToday,
        isFuture,
        details,
      };
    });
  }, [weekDays, relevantMeds, todayDateStr, currentLanguage]);

  // Weekly Statistics
  const weeklyStats = useMemo(() => {
    const pastAndToday = chartData.filter((d) => !d.isFuture && d.totalExpected > 0);
    if (pastAndToday.length === 0) {
      return {
        averageRate: 100,
        totalTaken: 0,
        totalExpected: 0,
        perfectDays: 0,
        streakDays: 0,
      };
    }

    const totalTaken = pastAndToday.reduce((sum, d) => sum + d.takenCount, 0);
    const totalExpected = pastAndToday.reduce((sum, d) => sum + d.totalExpected, 0);
    const averageRate = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 100;
    const perfectDays = pastAndToday.filter((d) => d.rate === 100).length;

    // Consecutive perfect days ending today/yesterday
    let streak = 0;
    for (let i = pastAndToday.length - 1; i >= 0; i--) {
      if (pastAndToday[i].rate >= 90) {
        streak++;
      } else {
        break;
      }
    }

    return {
      averageRate,
      totalTaken,
      totalExpected,
      perfectDays,
      streakDays: streak,
    };
  }, [chartData]);

  // Selected Day info for detail breakdown
  const selectedDayData = useMemo(() => {
    return chartData.find((d) => d.dateStr === selectedDayDate) || chartData.find((d) => d.isToday) || chartData[0];
  }, [chartData, selectedDayDate]);

  // Color picker for bar fills
  const getBarColor = (entry: DayAdherenceData) => {
    if (entry.isFuture) return '#e2e8f0'; // Gray for future
    if (entry.rate === 100) return '#10b981'; // Emerald 500
    if (entry.rate >= 80) return '#0ea5e9'; // Sky 500
    if (entry.rate >= 50) return '#f59e0b'; // Amber 500
    return '#f43f5e'; // Rose 500
  };

  const handleSpeakSummary = () => {
    const text =
      currentLanguage === 'hi'
        ? `इस सप्ताह आपकी दवा नियमितता दर ${weeklyStats.averageRate} प्रतिशत है। आपने कुल ${weeklyStats.totalExpected} में से ${weeklyStats.totalTaken} खुराकें ली हैं। ${
            weeklyStats.averageRate >= 80
              ? 'शानदार काम! आपकी नियमितता बहुत अच्छी है।'
              : 'कृपया अपनी दवाओं को समय पर लेना जारी रखें।'
          }`
        : `Your weekly medication adherence rate is ${weeklyStats.averageRate} percent. You have taken ${weeklyStats.totalTaken} out of ${weeklyStats.totalExpected} scheduled doses this week. ${
            weeklyStats.averageRate >= 80
              ? 'Excellent consistency! Keep up the healthy habits.'
              : 'Aim to take your doses consistently with meal reminders.'
          }`;
    speakText(text, currentLanguage);
  };

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: DayAdherenceData = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-1.5 min-w-[170px] animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1 font-bold">
            <span>{data.fullLabel}</span>
            {data.isToday && (
              <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.2 rounded font-black uppercase">
                Today
              </span>
            )}
          </div>
          {data.isFuture ? (
            <div className="text-slate-400 italic">Upcoming scheduled day</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Adherence Rate:</span>
                <span
                  className={`font-black text-sm ${
                    data.rate >= 90
                      ? 'text-emerald-400'
                      : data.rate >= 75
                      ? 'text-sky-400'
                      : data.rate >= 50
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {data.rate}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Doses Taken:</span>
                <span className="font-bold text-white">
                  {data.takenCount} / {data.totalExpected}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-800">
                Click bar to inspect dose breakdown
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-6">
      {/* Top Header: Title, Filters & Voice Readout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
              <BarChart3 className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {currentLanguage === 'hi'
                    ? 'साप्ताहिक दवा नियमितता चार्ट'
                    : 'Weekly Medication Adherence'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Award className="w-3 h-3 text-emerald-600" />
                  <span>
                    {weeklyStats.averageRate >= 90
                      ? currentLanguage === 'hi' ? 'उत्कृष्ट' : 'Outstanding'
                      : weeklyStats.averageRate >= 75
                      ? currentLanguage === 'hi' ? 'अच्छा' : 'Good Consistency'
                      : currentLanguage === 'hi' ? 'मध्यम' : 'Needs Focus'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {currentLanguage === 'hi'
                  ? 'चालू सप्ताह के दैनिक दवा लेने की दर व निरंतरता देखें'
                  : 'Track your daily intake consistency and adherence benchmark for the week'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Voice Summary */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTimeframe('current_week')}
              className={`px-2.5 py-1 rounded-lg transition ${
                timeframe === 'current_week'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {currentLanguage === 'hi' ? 'चालू सप्ताह' : 'Current Week'}
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('rolling_7')}
              className={`px-2.5 py-1 rounded-lg transition ${
                timeframe === 'rolling_7'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {currentLanguage === 'hi' ? 'पिछले 7 दिन' : 'Past 7 Days'}
            </button>
          </div>

          {/* Voice readout */}
          <button
            type="button"
            onClick={handleSpeakSummary}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5 border border-blue-200 active:scale-95"
            title="Listen to weekly adherence summary"
          >
            <Volume2 className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">
              {currentLanguage === 'hi' ? 'ऑडियो सारांश' : 'Listen Summary'}
            </span>
          </button>
        </div>
      </div>

      {/* KPI Highlight Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Average Adherence Rate */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 rounded-2xl border border-slate-200/80">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            {currentLanguage === 'hi' ? 'साप्ताहिक औसत' : 'Weekly Adherence'}
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                weeklyStats.averageRate >= 80 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {weeklyStats.averageRate}%
            </span>
            <span className="text-xs font-bold text-slate-600">rate</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                weeklyStats.averageRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, weeklyStats.averageRate)}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Doses Taken vs Scheduled */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            {currentLanguage === 'hi' ? 'ली गई खुराकें' : 'Doses Taken'}
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {weeklyStats.totalTaken}
            </span>
            <span className="text-xs font-bold text-slate-500">
              / {weeklyStats.totalExpected} scheduled
            </span>
          </div>
          <span className="text-[11px] text-slate-600 font-semibold block mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {weeklyStats.totalExpected - weeklyStats.totalTaken === 0
                ? 'Zero missed doses!'
                : `${weeklyStats.totalExpected - weeklyStats.totalTaken} missed/pending`}
            </span>
          </span>
        </div>

        {/* Metric 3: Perfect Adherence Days */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            {currentLanguage === 'hi' ? 'शत-प्रतिशत दिन' : '100% Days'}
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
              {weeklyStats.perfectDays}
            </span>
            <span className="text-xs font-bold text-slate-500">
              / {chartData.filter((d) => !d.isFuture).length} days
            </span>
          </div>
          <span className="text-[11px] text-slate-600 font-semibold block mt-1">
            Target: 80%+ adherence
          </span>
        </div>

        {/* Metric 4: Adherence Streak */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-2xl border border-amber-200">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            <span>{currentLanguage === 'hi' ? 'निरंतर स्ट्रीक' : 'Current Streak'}</span>
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight">
              {weeklyStats.streakDays}
            </span>
            <span className="text-xs font-bold text-amber-900">
              {weeklyStats.streakDays === 1 ? 'Day' : 'Days'} 🔥
            </span>
          </div>
          <span className="text-[11px] text-amber-800 font-semibold block mt-1">
            Consistent on-time doses
          </span>
        </div>
      </div>

      {/* Category Filter Pills (All / Meds / Supplements) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1">Filter View:</span>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
              filterType === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Items
          </button>
          <button
            type="button"
            onClick={() => setFilterType('medication')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              filterType === 'medication'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Pill className="w-3 h-3" />
            <span>Prescription Meds</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('supplement')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              filterType === 'supplement'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Leaf className="w-3 h-3" />
            <span>Supplements & Vitamins</span>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-600 font-bold">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>100% Perfect</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span>80-99% Good</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>50-79%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>&lt;50% Missed</span>
          </span>
        </div>
      </div>

      {/* Main Bar Chart */}
      <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200/80">
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 15, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="dayShort"
                tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={80}
                stroke="#059669"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Target: 80%',
                  fill: '#047857',
                  fontSize: 10,
                  fontWeight: 700,
                  position: 'insideTopRight',
                }}
              />
              <Bar
                dataKey="rate"
                radius={[8, 8, 2, 2]}
                maxBarSize={48}
                cursor="pointer"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={`bar-${entry.dateStr}`}
                    fill={getBarColor(entry)}
                    stroke={
                      entry.dateStr === selectedDayDate
                        ? '#1d4ed8'
                        : entry.isToday
                        ? '#2563eb'
                        : 'none'
                    }
                    strokeWidth={entry.dateStr === selectedDayDate ? 3 : entry.isToday ? 2 : 0}
                    className="transition-all hover:opacity-85 cursor-pointer"
                    onClick={() => setSelectedDayDate(entry.dateStr)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
          <span className="flex items-center gap-1 font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-600 ring-2 ring-blue-200" />
            <span>Blue ring marks selected day ({selectedDayData.dayShort})</span>
          </span>
          <span className="italic">Click any bar to view details</span>
        </div>
      </div>

      {/* Selected Day Intake Inspector Breakdown */}
      {selectedDayData && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm sm:text-base font-black text-slate-900">
                <span>{selectedDayData.fullLabel}</span>
                {selectedDayData.isToday && (
                  <span className="ml-2 text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    Today
                  </span>
                )}
              </h4>
            </div>

            <span
              className={`text-xs font-black px-2.5 py-1 rounded-xl ${
                selectedDayData.rate >= 90
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : selectedDayData.rate >= 75
                  ? 'bg-sky-100 text-sky-800 border border-sky-300'
                  : selectedDayData.rate >= 50
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              {selectedDayData.rate}% Adherence ({selectedDayData.takenCount}/{selectedDayData.totalExpected} doses)
            </span>
          </div>

          {selectedDayData.details.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-2">
              No medications scheduled for this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
              {selectedDayData.details.map((item, idx) => (
                <div
                  key={`${item.medId}-${item.slot}-${idx}`}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                    item.isTaken
                      ? 'bg-emerald-50/80 border-emerald-200 text-slate-900'
                      : 'bg-white border-slate-200 text-slate-700 opacity-90'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">
                        {item.category === 'supplement' ? '🌿' : '💊'}
                      </span>
                      <span className="text-xs font-bold truncate block">{item.medName}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      {item.slot.toUpperCase()} • {item.dosage}
                    </span>
                  </div>

                  {item.isTaken ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-black shrink-0 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Taken</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleTaken?.(item.medId, item.slot)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-[11px] font-bold shrink-0 transition"
                      title="Mark as taken"
                    >
                      {selectedDayData.isToday ? 'Take Now' : 'Mark Taken'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
