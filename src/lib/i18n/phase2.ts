/**
 * Phase 2 interface strings — Offline Health Card + guided symptom checker.
 * Falls back through language → English → key, same as part2/part3/part4.
 *
 * Safety wording rules encoded here (verified by the parity test):
 * - never a diagnosis, never "you are safe" / "nothing is serious";
 * - never a medicine, dosage, or prescription suggestion;
 * - routine is phrased as a routing suggestion, not a health claim;
 * - emergency copy never invents a phone number or service availability;
 * - no model/technical jargon (no confidence, model, JSON, AI terms in the
 *   primary patient-facing strings beyond the plain "language understanding"
 *   wording used for honest availability notices).
 */

import type { Language } from "./index";

export interface Phase2Dict {
  // Entry cards (dashboard)
  entryMyHealth: string;
  entryHealthCardSubtitle: string;
  entryCheckSymptoms: string;
  entryCheckSymptomsSubtitle: string;
  entrySpeakSymptoms: string;

  // Offline health card
  hcTitle: string;
  hcAvailableOffline: string;
  hcIntro: string;
  hcStoredOnDevice: string;
  hcSectionProfile: string;
  hcSectionMedicines: string;
  hcSectionAllergies: string;
  hcSectionConditions: string;
  hcSectionRecentCare: string;
  hcSectionDocuments: string;
  hcProfileName: string;
  hcProfileLanguage: string;
  hcNotRecorded: string;
  hcNoMedicines: string;
  hcNoRecentCare: string;
  hcDocumentsNotCached: string;
  hcLastUpdated: string;
  timeJustNow: string;
  timeMinutes: string;
  timeMinuteAgo: string;
  timeHours: string;
  timeHourAgo: string;
  timeDays: string;
  timeDayAgo: string;
  timeUnknown: string;
  hcStaleNote: string;
  hcSyncSynced: string;
  hcSyncUpdating: string;
  hcSyncWaiting: string;
  hcSyncAttention: string;
  hcRefreshError: string;
  hcRefresh: string;
  hcRefreshed: string;
  hcClear: string;
  hcClearTitle: string;
  hcClearBody: string;
  hcClearConfirm: string;
  hcCleared: string;
  hcEmptyTitle: string;
  hcEmptyBody: string;
  hcOfflineBanner: string;
  hcEditFacts: string;
  hcFactsAllergiesLabel: string;
  hcFactsConditionsLabel: string;
  hcAddAllergyPlaceholder: string;
  hcAddConditionPlaceholder: string;
  hcAdd: string;
  hcRemoveItem: string;
  hcSaveFacts: string;
  hcFactsSaved: string;
  hcFactsNeedsOnline: string;
  hcFactsInvalid: string;

  // Symptom checker — flow
  scTitle: string;
  scIntro: string;
  scStep: string;
  scFeelingHeading: string;
  scFeelingHint: string;
  scContinue: string;
  scBack: string;
  scOther: string;
  scSkip: string;
  scDurationHeading: string;
  durToday: string;
  dur1to3: string;
  dur4to7: string;
  durOverWeek: string;
  durUnsure: string;
  scSeverityHeading: string;
  sevMild: string;
  sevModerate: string;
  sevSevere: string;
  sevUnsure: string;
  scDescribeHeading: string;
  scDescribePlaceholder: string;
  scSpeak: string;
  scListening: string;
  scVoiceTitle: string;
  scVoiceCorrect: string;
  scVoiceRetry: string;
  scVoiceUnsupported: string;
  scInterpreting: string;
  scAiUnavailable: string;
  scAiUnavailableOffline: string;
  scFallbackHint: string;
  scOfflineMode: string;

  // Symptom checker — clarification questions
  scClarifyHeading: string;
  scClarifyHint: string;
  scYes: string;
  scNo: string;
  scNotSure: string;
  scFuBreathing: string;
  scFuChest: string;
  scFuBleeding: string;
  scFuVomiting: string;
  scFuFever: string;
  scFuHeadache: string;
  scFuInjury: string;
  scFuWorse: string;

  // Symptom checker — results
  scResultsHeading: string;
  scUnderstanding: string;
  urgEmergency: string;
  urgUrgent: string;
  urgRoutine: string;
  urgUncertain: string;
  naEmergency: string;
  naUrgent: string;
  naRoutine: string;
  naUncertain: string;
  safeEmergency: string;
  safeUrgent: string;
  safeRoutine: string;
  safeUncertain: string;
  scDisclaimer: string;
  scListen: string;
  scTalkToDoctor: string;
  scStartOver: string;
  scNoSymptoms: string;

  // Symptom checker — consent handoff
  shareTitle: string;
  shareIntro: string;
  shareSymptoms: string;
  shareMedicines: string;
  shareAllergies: string;
  shareConfirm: string;
  scCancel: string;
  shareNoCard: string;
}

const en: Phase2Dict = {
  entryMyHealth: "My health",
  entryHealthCardSubtitle: "Offline health card — available without internet",
  entryCheckSymptoms: "Check my symptoms",
  entryCheckSymptomsSubtitle: "Guided symptom check that works offline",
  entrySpeakSymptoms: "Speak your symptoms",

  hcTitle: "Offline health card",
  hcAvailableOffline: "Available without internet",
  hcIntro:
    "Essential health information saved on this device so you can show it even when there is no network.",
  hcStoredOnDevice: "Stored on this device (encrypted)",
  hcSectionProfile: "Basic profile",
  hcSectionMedicines: "Current medicines",
  hcSectionAllergies: "Allergies",
  hcSectionConditions: "Important conditions",
  hcSectionRecentCare: "Recent care summary",
  hcSectionDocuments: "Full medical documents",
  hcProfileName: "Name",
  hcProfileLanguage: "Preferred language",
  hcNotRecorded: "Not recorded",
  hcNoMedicines: "No active medicines recorded",
  hcNoRecentCare: "No recent care yet",
  hcDocumentsNotCached: "Not stored on this device — open Records when online.",
  hcLastUpdated: "Last updated {time}",
  timeJustNow: "just now",
  timeMinutes: "{count} minutes ago",
  timeMinuteAgo: "1 minute ago",
  timeHours: "{count} hours ago",
  timeHourAgo: "1 hour ago",
  timeDays: "{count} days ago",
  timeDayAgo: "1 day ago",
  timeUnknown: "some time ago",
  hcStaleNote: "Some information may have changed since this update.",
  hcSyncSynced: "✓ Up to date",
  hcSyncUpdating: "Updating…",
  hcSyncWaiting: "○ Waiting for connection",
  hcSyncAttention: "Needs attention",
  hcRefreshError: "Could not update right now — showing your saved copy.",
  hcRefresh: "Update now",
  hcRefreshed: "Health card updated.",
  hcClear: "Clear offline health card",
  hcClearTitle: "Remove health information stored on this device?",
  hcClearBody:
    "This removes the saved copy from this device only. Records in your health space are not deleted.",
  hcClearConfirm: "Remove",
  hcCleared: "Removed from this device",
  hcEmptyTitle: "No saved copy on this device",
  hcEmptyBody: "Connect once to save your health card for offline use.",
  hcOfflineBanner: "📶 Offline — your saved health information is still available.",
  hcEditFacts: "Edit allergies and conditions",
  hcFactsAllergiesLabel: "Allergies",
  hcFactsConditionsLabel: "Important conditions",
  hcAddAllergyPlaceholder: "Add an allergy, e.g. penicillin",
  hcAddConditionPlaceholder: "Add a condition, e.g. asthma",
  hcAdd: "Add",
  hcRemoveItem: "Remove",
  hcSaveFacts: "Save",
  hcFactsSaved: "Saved.",
  hcFactsNeedsOnline: "Saving needs a connection. Your changes stay on this screen.",
  hcFactsInvalid: "Could not save. Please try again.",

  scTitle: "Check my symptoms",
  scIntro:
    "Organizes your symptoms and how urgent they may be. It does not diagnose illness.",
  scStep: "Question {current} of {total}",
  scFeelingHeading: "How are you feeling?",
  scFeelingHint: "Choose everything that fits.",
  scContinue: "Continue",
  scBack: "Back",
  scOther: "Other / type it",
  scSkip: "Skip",
  scDurationHeading: "How long has this been going on?",
  durToday: "Today",
  dur1to3: "1–3 days",
  dur4to7: "4–7 days",
  durOverWeek: "More than a week",
  durUnsure: "Not sure",
  scSeverityHeading: "How bad is it?",
  sevMild: "Mild",
  sevModerate: "Moderate",
  sevSevere: "Severe",
  sevUnsure: "Not sure",
  scDescribeHeading: "Describe it in your own words (optional)",
  scDescribePlaceholder: "For example: fever since two days…",
  scSpeak: "Speak",
  scListening: "Listening…",
  scVoiceTitle: "You said:",
  scVoiceCorrect: "Correct",
  scVoiceRetry: "Try again",
  scVoiceUnsupported:
    "Voice input is not available in this browser. You can type instead.",
  scInterpreting: "Understanding your symptoms…",
  scAiUnavailable: "Advanced language understanding is unavailable right now.",
  scAiUnavailableOffline: "Advanced language understanding is unavailable offline.",
  scFallbackHint: "Use the symptom buttons or continue with guided questions.",
  scOfflineMode: "Offline — guided symptom selection is active.",

  scClarifyHeading: "A few quick questions",
  scClarifyHint: "Tap Yes, No, or Not sure.",
  scYes: "Yes",
  scNo: "No",
  scNotSure: "Not sure",
  scFuBreathing: "Are you having trouble breathing right now, while resting?",
  scFuChest: "Is the chest discomfort spreading or feeling like pressure?",
  scFuBleeding: "Is the bleeding not stopping?",
  scFuVomiting: "Are you unable to keep fluids down because of vomiting?",
  scFuFever: "Has the fever lasted three days or more?",
  scFuHeadache: "Did the headache come on suddenly and very severely?",
  scFuInjury: "Did the injury happen from a serious accident or fall?",
  scFuWorse: "Have your symptoms suddenly become worse?",

  scResultsHeading: "Your next step",
  scUnderstanding: "What we understood",
  urgEmergency: "Emergency",
  urgUrgent: "Urgent",
  urgRoutine: "Routine",
  urgUncertain: "Needs review",
  naEmergency: "Seek emergency help now",
  naUrgent: "Talk to a doctor soon",
  naRoutine: "Talk to a doctor",
  naUncertain: "Check your symptoms again",
  safeEmergency:
    "Some symptoms you reported may require urgent medical attention. Please seek immediate local emergency medical help, or go to the nearest emergency facility now.",
  safeUrgent:
    "Some symptoms you described may need medical attention. Based on the information provided, a clinician should review this soon.",
  safeRoutine:
    "Based on the information provided, a doctor can review your symptoms. This is a routing suggestion, not a health assessment.",
  safeUncertain:
    "We could not clearly understand your symptom. Choose a symptom below, speak again, or talk to a doctor.",
  scDisclaimer:
    "Healthfolio's symptom checker helps organize symptoms and urgency. It does not diagnose illness.",
  scListen: "Listen",
  scTalkToDoctor: "Talk to a doctor",
  scStartOver: "Start again",
  scNoSymptoms: "Choose at least one symptom or describe what you feel.",

  shareTitle: "Share with doctor",
  shareIntro: "Choose what to include when you continue to a care request.",
  shareSymptoms: "Symptom summary",
  shareMedicines: "Current medicines",
  shareAllergies: "Allergies",
  shareConfirm: "Share",
  scCancel: "Cancel",
  shareNoCard:
    "No health card is saved on this device — only your symptom summary will be shared.",
};

const hi: Phase2Dict = {
  entryMyHealth: "मेरा स्वास्थ्य",
  entryHealthCardSubtitle: "ऑफ़लाइन हेल्थ कार्ड — बिना इंटरनेट उपलब्ध",
  entryCheckSymptoms: "अपने लक्षण जाँचें",
  entryCheckSymptomsSubtitle: "ऑफ़लाइन चलने वाली गाइडेड लक्षण जाँच",
  entrySpeakSymptoms: "अपने लक्षण बोलकर बताएँ",

  hcTitle: "ऑफ़लाइन हेल्थ कार्ड",
  hcAvailableOffline: "बिना इंटरनेट उपलब्ध",
  hcIntro:
    "ज़रूरी स्वास्थ्य जानकारी इस डिवाइस पर सहेजी जाती है ताकि नेटवर्क न होने पर भी आप इसे दिखा सकें।",
  hcStoredOnDevice: "इस डिवाइस पर संग्रहित (एन्क्रिप्टेड)",
  hcSectionProfile: "मूल जानकारी",
  hcSectionMedicines: "चल रही दवाइयाँ",
  hcSectionAllergies: "एलर्जी",
  hcSectionConditions: "महत्वपूर्ण स्थितियाँ",
  hcSectionRecentCare: "हाल की देखभाल का सारांश",
  hcSectionDocuments: "पूरे चिकित्सा दस्तावेज़",
  hcProfileName: "नाम",
  hcProfileLanguage: "पसंदीदा भाषा",
  hcNotRecorded: "दर्ज नहीं है",
  hcNoMedicines: "कोई सक्रिय दवा दर्ज नहीं है",
  hcNoRecentCare: "अभी कोई हाल की देखभाल नहीं",
  hcDocumentsNotCached: "इस डिवाइस पर संग्रहित नहीं — ऑनलाइन होने पर रिकॉर्ड्स खोलें।",
  hcLastUpdated: "अंतिम अपडेट {time}",
  timeJustNow: "अभी-अभी",
  timeMinutes: "{count} मिनट पहले",
  timeMinuteAgo: "1 मिनट पहले",
  timeHours: "{count} घंटे पहले",
  timeHourAgo: "1 घंटा पहले",
  timeDays: "{count} दिन पहले",
  timeDayAgo: "1 दिन पहले",
  timeUnknown: "कुछ समय पहले",
  hcStaleNote: "इस अपडेट के बाद से कुछ जानकारी बदल सकती है।",
  hcSyncSynced: "✓ अपडेटेड",
  hcSyncUpdating: "अपडेट हो रहा है…",
  hcSyncWaiting: "○ कनेक्शन की प्रतीक्षा में",
  hcSyncAttention: "ध्यान देने की आवश्यकता",
  hcRefreshError: "अभी अपडेट नहीं हो सका — आपकी सहेजी कॉपी दिख रही है।",
  hcRefresh: "अभी अपडेट करें",
  hcRefreshed: "हेल्थ कार्ड अपडेट हो गया।",
  hcClear: "ऑफ़लाइन हेल्थ कार्ड हटाएँ",
  hcClearTitle: "इस डिवाइस पर सहेजी स्वास्थ्य जानकारी हटाएँ?",
  hcClearBody:
    "यह केवल इस डिवाइस से सहेजी कॉपी हटाता है। आपके हेल्थ स्पेस में रिकॉर्ड नहीं मिटाए जाते।",
  hcClearConfirm: "हटाएँ",
  hcCleared: "इस डिवाइस से हटा दिया गया",
  hcEmptyTitle: "इस डिवाइस पर कोई सहेजी कॉपी नहीं",
  hcEmptyBody: "हेल्थ कार्ड ऑफ़लाइन सहेजने के लिए एक बार कनेक्ट करें।",
  hcOfflineBanner: "📶 ऑफ़लाइन — आपकी सहेजी स्वास्थ्य जानकारी अभी भी उपलब्ध है।",
  hcEditFacts: "एलर्जी और स्थितियाँ संपादित करें",
  hcFactsAllergiesLabel: "एलर्जी",
  hcFactsConditionsLabel: "महत्वपूर्ण स्थितियाँ",
  hcAddAllergyPlaceholder: "एलर्जी जोड़ें, जैसे पेनिसिलिन",
  hcAddConditionPlaceholder: "स्थिति जोड़ें, जैसे दमा",
  hcAdd: "जोड़ें",
  hcRemoveItem: "हटाएँ",
  hcSaveFacts: "सहेजें",
  hcFactsSaved: "सहेज लिया गया।",
  hcFactsNeedsOnline: "सहेजने के लिए कनेक्शन चाहिए। आपके बदलाव इसी स्क्रीन पर रहेंगे।",
  hcFactsInvalid: "सहेजा नहीं जा सका। कृपया दोबारा कोशिश करें।",

  scTitle: "अपने लक्षण जाँचें",
  scIntro: "यह आपके लक्षणों और जल्दबाज़ी के स्तर को क्रम में रखता है। यह बीमारी का निदान नहीं करता।",
  scStep: "प्रश्न {current} / {total}",
  scFeelingHeading: "आप कैसा महसूस कर रहे हैं?",
  scFeelingHint: "जो भी लागू हो, वह चुनें।",
  scContinue: "आगे बढ़ें",
  scBack: "पीछे",
  scOther: "अन्य / लिखें",
  scSkip: "छोड़ें",
  scDurationHeading: "यह कितने समय से है?",
  durToday: "आज ही",
  dur1to3: "1–3 दिन",
  dur4to7: "4–7 दिन",
  durOverWeek: "एक हफ़्ते से ज़्यादा",
  durUnsure: "पता नहीं",
  scSeverityHeading: "कितना गंभीर है?",
  sevMild: "हल्का",
  sevModerate: "मध्यम",
  sevSevere: "गंभीर",
  sevUnsure: "पता नहीं",
  scDescribeHeading: "अपने शब्दों में बताएँ (वैकल्पिक)",
  scDescribePlaceholder: "जैसे: दो दिन से बुखार है…",
  scSpeak: "बोलें",
  scListening: "सुन रहे हैं…",
  scVoiceTitle: "आपने कहा:",
  scVoiceCorrect: "सही है",
  scVoiceRetry: "दोबारा",
  scVoiceUnsupported: "इस ब्राउज़र में आवाज़ इनपुट उपलब्ध नहीं है। आप लिखकर बता सकते हैं।",
  scInterpreting: "आपके लक्षण समझे जा रहे हैं…",
  scAiUnavailable: "भाषा समझने की सुविधा अभी उपलब्ध नहीं है।",
  scAiUnavailableOffline: "ऑफ़लाइन में भाषा समझने की सुविधा उपलब्ध नहीं है।",
  scFallbackHint: "लक्षण बटन इस्तेमाल करें या गाइडेड सवालों से जारी रखें।",
  scOfflineMode: "ऑफ़लाइन — गाइडेड लक्षण चयन चालू है।",

  scClarifyHeading: "कुछ छोटे सवाल",
  scClarifyHint: "हाँ, नहीं, या निश्चित नहीं दबाएँ।",
  scYes: "हाँ",
  scNo: "नहीं",
  scNotSure: "पता नहीं",
  scFuBreathing: "क्या आपको अभी आराम से बैठे-बैठे सांस लेने में दिक्कत हो रही है?",
  scFuChest: "क्या सीने की तकलीफ़ फैल रही है या दबाव जैसी लग रही है?",
  scFuBleeding: "क्या खून नहीं रुक रहा है?",
  scFuVomiting: "क्या उल्टी की वजह से तरल अंदर नहीं रख पा रहे हैं?",
  scFuFever: "क्या बुखार तीन दिन या उससे ज़्यादा है?",
  scFuHeadache: "क्या सिरदर्द अचानक और बहुत तेज़ आया?",
  scFuInjury: "क्या चोट बड़े हादसे या गिरने से लगी है?",
  scFuWorse: "क्या लक्षण अचानक और बिगड़ गए हैं?",

  scResultsHeading: "आपका अगला क़दम",
  scUnderstanding: "हमने यह समझा",
  urgEmergency: "आपातकाल",
  urgUrgent: "ज़रूरी",
  urgRoutine: "सामान्य",
  urgUncertain: "समीक्षा ज़रूरी",
  naEmergency: "अभी आपातकालीन मदद लें",
  naUrgent: "जल्द डॉक्टर से बात करें",
  naRoutine: "डॉक्टर से बात करें",
  naUncertain: "लक्षण दोबारा जाँचें",
  safeEmergency:
    "आपने जो लक्षण बताए हैं उनमें तुरंत चिकित्सकीय मदद ज़रूरी हो सकती है। कृपया अभी स्थानीय आपातकालीन मदद लें या नज़दीकी आपातकालीन केंद्र जाएँ।",
  safeUrgent:
    "आपने जो लक्षण बताए हैं, उन पर चिकित्सक की नज़र होनी चाहिए। दी गई जानकारी के आधार पर जल्द डॉक्टर से संपर्क करें।",
  safeRoutine:
    "दी गई जानकारी के आधार पर डॉक्टर आपके लक्षण देख सकते हैं। यह एक रूटिंग सुझाव है, स्वास्थ्य आकलन नहीं।",
  safeUncertain:
    "आपका लक्षण स्पष्ट समझ नहीं आया। नीचे कोई लक्षण चुनें, दोबारा बोलें, या डॉक्टर से बात करें।",
  scDisclaimer:
    "हेल्थफ़ोलियो का लक्षण चेकर लक्षणों और जल्दबाज़ी को क्रम में रखने में मदद करता है। यह बीमारी का निदान नहीं करता।",
  scListen: "सुनें",
  scTalkToDoctor: "डॉक्टर से बात करें",
  scStartOver: "फिर से शुरू करें",
  scNoSymptoms: "कम से कम एक लक्षण चुनें या जो महसूस हो रहा है वह लिखें।",

  shareTitle: "डॉक्टर के साथ साझा करें",
  shareIntro: "केयर रिक्वेस्ट जारी रखते समय क्या शामिल करना है, चुनें।",
  shareSymptoms: "लक्षण सारांश",
  shareMedicines: "चल रही दवाइयाँ",
  shareAllergies: "एलर्जी",
  shareConfirm: "साझा करें",
  scCancel: "रद्द करें",
  shareNoCard: "इस डिवाइस पर कोई हेल्थ कार्ड सहेजा नहीं है — केवल आपका लक्षण सारांश साझा होगा।",
};

const or: Phase2Dict = {
  entryMyHealth: "ମୋ ସ୍ୱାସ୍ଥ୍ୟ",
  entryHealthCardSubtitle: "ଅଫଲାଇନ୍ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ — ଇଣ୍ଟରନେଟ୍ ବିନା ଉପଲବ୍ଧ",
  entryCheckSymptoms: "ମୋ ଲକ୍ଷଣ ଯାଞ୍ଚ କରନ୍ତୁ",
  entryCheckSymptomsSubtitle: "ଅଫଲାଇନ୍ ଚାଲୁଥିବା ଗାଇଡେଡ୍ ଲକ୍ଷଣ ଯାଞ୍ଚ",
  entrySpeakSymptoms: "ଲକ୍ଷଣ କହିକୁହନ୍ତୁ",

  hcTitle: "ଅଫଲାଇନ୍ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ",
  hcAvailableOffline: "ଇଣ୍ଟରନେଟ୍ ବିନା ଉପଲବ୍ଧ",
  hcIntro:
    "ଜରୁରୀ ସ୍ୱାସ୍ଥ୍ୟ ସୂଚନା ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ହୁଏ, ଯେପରି ନେଟୱର୍କ ନ ଥିଲେ ମଧ୍ୟ ଆପଣ ଦେଖାଇପାରିବେ।",
  hcStoredOnDevice: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ (ଏନ୍କ୍ରିପ୍ଟେଡ୍)",
  hcSectionProfile: "ମୌଳିକ ସୂଚନା",
  hcSectionMedicines: "ଚାଲୁଥିବା ଔଷଧ",
  hcSectionAllergies: "ଏଲର୍ଜି",
  hcSectionConditions: "ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ଅବସ୍ଥା",
  hcSectionRecentCare: "ସାମ୍ପ୍ରତିକ ଯତ୍ନ ସାରାଂଶ",
  hcSectionDocuments: "ସମ୍ପୂର୍ଣ୍ଣ ମେଡିକାଲ୍ ଦସ୍ତାବିଜ୍",
  hcProfileName: "ନାମ",
  hcProfileLanguage: "ପସନ୍ଦର ଭାଷା",
  hcNotRecorded: "ରେକର୍ଡ ନାହିଁ",
  hcNoMedicines: "କୌଣସି ସକ୍ରିୟ ଔଷଧ ରେକର୍ଡ ନାହିଁ",
  hcNoRecentCare: "ଏବେ କୌଣସି ସାମ୍ପ୍ରତିକ ଯତ୍ନ ନାହିଁ",
  hcDocumentsNotCached: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ନୁହେଁ — ଅନଲାଇନ୍ ଥିବାବେଳେ ରେକର୍ଡ ଖୋଲନ୍ତୁ।",
  hcLastUpdated: "ଶେଷ ଅପଡେଟ୍ {time}",
  timeJustNow: "ଏଇମାତ୍ର",
  timeMinutes: "{count} ମିନିଟ୍ ପୂର୍ବେ",
  timeMinuteAgo: "1 ମିନିଟ୍ ପୂର୍ବେ",
  timeHours: "{count} ଘଣ୍ଟା ପୂର୍ବେ",
  timeHourAgo: "1 ଘଣ୍ଟା ପୂର୍ବେ",
  timeDays: "{count} ଦିନ ପୂର୍ବେ",
  timeDayAgo: "1 ଦିନ ପୂର୍ବେ",
  timeUnknown: "କିଛି ସମୟ ପୂର୍ବେ",
  hcStaleNote: "ଏହି ଅପଡେଟ୍ ପରେ କିଛି ସୂଚନା ବଦଳିଥାଇପାରେ।",
  hcSyncSynced: "✓ ଅପଡେଟେଡ୍",
  hcSyncUpdating: "ଅପଡେଟ୍ ହେଉଛି…",
  hcSyncWaiting: "○ ସଂଯୋଗ ଅପେକ୍ଷାରେ",
  hcSyncAttention: "ଧ୍ୟାନ ଦରକାର",
  hcRefreshError: "ଏବେ ଅପଡେଟ୍ ହୋଇପାରିଲା ନାହିଁ — ଆପଣଙ୍କ ସଂରକ୍ଷିତ କପି ଦେଖାଯାଉଛି।",
  hcRefresh: "ଏବେ ଅପଡେଟ୍ କରନ୍ତୁ",
  hcRefreshed: "ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ଅପଡେଟ୍ ହେଲା।",
  hcClear: "ଅଫଲାଇନ୍ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ହଟାନ୍ତୁ",
  hcClearTitle: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ ସ୍ୱାସ୍ଥ୍ୟ ସୂଚନା ହଟାଇବେ?",
  hcClearBody:
    "ଏହା କେବଳ ଏହି ଡିଭାଇସରୁ ସଂରକ୍ଷିତ କପି ହଟାଏ। ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସ୍ଥାନର ରେକର୍ଡ ଡିଲିଟ୍ ହୁଏ ନାହିଁ।",
  hcClearConfirm: "ହଟାନ୍ତୁ",
  hcCleared: "ଏହି ଡିଭାଇସରୁ ହଟାଇ ଦିଆଯାଇଛି",
  hcEmptyTitle: "ଏହି ଡିଭାଇସରେ କୌଣସି ସଂରକ୍ଷିତ କପି ନାହିଁ",
  hcEmptyBody: "ଅଫଲାଇନ୍ ପାଇଁ ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ସଂରକ୍ଷଣ କରିବାକୁ ଥରେ ସଂଯୋଗ କରନ୍ତୁ।",
  hcOfflineBanner: "📶 ଅଫଲାଇନ୍ — ଆପଣଙ୍କ ସଂରକ୍ଷିତ ସ୍ୱାସ୍ଥ୍ୟ ସୂଚନା ଏବେ ମଧ୍ୟ ଉପଲବ୍ଧ।",
  hcEditFacts: "ଏଲର୍ଜି ଓ ଅବସ୍ଥା ସମ୍ପାଦନ କରନ୍ତୁ",
  hcFactsAllergiesLabel: "ଏଲର୍ଜି",
  hcFactsConditionsLabel: "ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ଅବସ୍ଥା",
  hcAddAllergyPlaceholder: "ଏଲର୍ଜି ଯୋଡ଼ନ୍ତୁ, ଯେପରିକି ପେନିସିଲିନ୍",
  hcAddConditionPlaceholder: "ଅବସ୍ଥା ଯୋଡ଼ନ୍ତୁ, ଯେପରିକି ଆଶ୍ମା",
  hcAdd: "ଯୋଡ଼ନ୍ତୁ",
  hcRemoveItem: "ହଟାନ୍ତୁ",
  hcSaveFacts: "ସଂରକ୍ଷଣ କରନ୍ତୁ",
  hcFactsSaved: "ସଂରକ୍ଷିତ ହେଲା।",
  hcFactsNeedsOnline: "ସଂରକ୍ଷଣ ପାଇଁ ସଂଯୋଗ ଦରକାର। ଆପଣଙ୍କ ପରିବର୍ତ୍ତନ ଏହି ସ୍କ୍ରିନରେ ରହିବ।",
  hcFactsInvalid: "ସଂରକ୍ଷଣ ହୋଇପାରିଲା ନାହିଁ। ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",

  scTitle: "ମୋ ଲକ୍ଷଣ ଯାଞ୍ଚ କରନ୍ତୁ",
  scIntro: "ଏହା ଆପଣଙ୍କ ଲକ୍ଷଣ ଓ ଜରୁରୀପଣକ୍ରମରେ ରଖେ। ଏହା ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ନାହିଁ।",
  scStep: "ପ୍ରଶ୍ନ {current} / {total}",
  scFeelingHeading: "ଆପଣ କେମିତି ଅନୁଭବ କରୁଛନ୍ତି?",
  scFeelingHint: "ଯାହା ଲାଗୁଛି ତାହା ବାଛନ୍ତୁ।",
  scContinue: "ଆଗକୁ ଯାଆନ୍ତୁ",
  scBack: "ପଛକୁ",
  scOther: "ଅନ୍ୟ / ଲେଖନ୍ତୁ",
  scSkip: "ଛାଡ଼ନ୍ତୁ",
  scDurationHeading: "ଏହା କେତେଦିନ ହେଲା?",
  durToday: "ଆଜି",
  dur1to3: "1–3 ଦିନ",
  dur4to7: "4–7 ଦିନ",
  durOverWeek: "ଏକ ସପ୍ତାହରୁ ଅଧିକ",
  durUnsure: "ଜଣା ନାହିଁ",
  scSeverityHeading: "କେତେ ଗୁରୁତର?",
  sevMild: "ହାଲୁକା",
  sevModerate: "ମଝିଆ",
  sevSevere: "ଗୁରୁତର",
  sevUnsure: "ଜଣା ନାହିଁ",
  scDescribeHeading: "ନିଜ ଭାଷାରେ କୁହନ୍ତୁ (ଐଚ୍ଛିକ)",
  scDescribePlaceholder: "ଯେପରି: ଦୁଇ ଦିନ ହେଲା ଜ୍ୱର ଅଛି…",
  scSpeak: "କୁହନ୍ତୁ",
  scListening: "ଶୁଣୁଛୁ…",
  scVoiceTitle: "ଆପଣ କହିଲେ:",
  scVoiceCorrect: "ଠିକ୍ ଅଛି",
  scVoiceRetry: "ପୁଣି",
  scVoiceUnsupported: "ଏହି ବ୍ରାଉଜରରେ ଭଏସ୍ ଇନପୁଟ୍ ଉପଲବ୍ଧ ନାହିଁ। ଆପଣ ଲେଖି ପାରିବେ।",
  scInterpreting: "ଆପଣଙ୍କ ଲକ୍ଷଣ ବୁଝାଯାଉଛି…",
  scAiUnavailable: "ଭାଷା ବୁଝିବା ସୁବିଧା ଏବେ ଉପଲବ୍ଧ ନାହିଁ।",
  scAiUnavailableOffline: "ଅଫଲାଇନ୍ରେ ଭାଷା ବୁଝିବା ସୁବିଧା ଉପଲବ୍ଧ ନାହିଁ।",
  scFallbackHint: "ଲକ୍ଷଣ ବଟନ୍ ବ୍ୟବହାର କରନ୍ତୁ କିମ୍ବା ଗାଇଡେଡ୍ ପ୍ରଶ୍ନରେ ଆଗକୁ ଯାଆନ୍ତୁ।",
  scOfflineMode: "ଅଫଲାଇନ୍ — ଗାଇଡେଡ୍ ଲକ୍ଷଣ ବାଛିବା ସକ୍ରିୟ।",

  scClarifyHeading: "କିଛି ଛୋଟ ପ୍ରଶ୍ନ",
  scClarifyHint: "ହଁ, ନାହିଁ, ବା ନିଶ୍ଚିତ ନୁହେଁ ଦବାନ୍ତୁ।",
  scYes: "ହଁ",
  scNo: "ନା",
  scNotSure: "ଜଣା ନାହିଁ",
  scFuBreathing: "ଏବେ ବିଶ୍ରାମ ଅବସ୍ଥାରେ ଆପଣଙ୍କୁ ନିଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା ହେଉଛି କି?",
  scFuChest: "ଛାତିର ଅସୁବିଧା ବ୍ୟାପୁଛି କି ଚାପ ଭଳି ଲାଗୁଛି କି?",
  scFuBleeding: "ରକ୍ତସ୍ରାବ ବନ୍ଦ ହେଉନାହିଁ କି?",
  scFuVomiting: "ବାନ୍ତି ଯୋଗୁଁ ତରଳ ପଦାର୍ଥ ପେଟରେ ରଖିପାରୁନାହାନ୍ତି କି?",
  scFuFever: "ଜ୍ୱର ତିନି ଦିନ କିମ୍ବା ତା'ଠାରୁ ଅଧିକ ହେଲା କି?",
  scFuHeadache: "ମୁଣ୍ଡବଥା ହଠାତ୍ ଓ ବହୁତ ଜୋରରେ ଆସିଲା କି?",
  scFuInjury: "ଆଘାତ ବଡ଼ ଦୁର୍ଘଟଣା କିମ୍ବା ପଡ଼ିବାରୁ ଲାଗିଲା କି?",
  scFuWorse: "ଲକ୍ଷଣ ହଠାତ୍ ଆହୁରି ଖରାପ ହୋଇଛି କି?",

  scResultsHeading: "ଆପଣଙ୍କ ପରବର୍ତ୍ତୀ ପଦକ୍ଷେପ",
  scUnderstanding: "ଆମେ ଏହା ବୁଝିଲୁ",
  urgEmergency: "ଜରୁରୀକାଳୀନ",
  urgUrgent: "ଜରୁରୀ",
  urgRoutine: "ସାଧାରଣ",
  urgUncertain: "ସମୀକ୍ଷା ଦରକାର",
  naEmergency: "ଏବେ ଜରୁରୀକାଳୀନ ସାହାଯ୍ୟ ନିଅନ୍ତୁ",
  naUrgent: "ଶୀଘ୍ର ଡାକ୍ତରଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ",
  naRoutine: "ଡାକ୍ତରଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ",
  naUncertain: "ଲକ୍ଷଣ ପୁଣି ଯାଞ୍ଚ କରନ୍ତୁ",
  safeEmergency:
    "ଆପଣ କହିଥିବା କିଛି ଲକ୍ଷଣ ପାଇଁ ତୁରନ୍ତ ଚିକିତ୍ସା ଦରକାର ହୋଇପାରେ। ଦୟାକରି ଏବେ ସ୍ଥାନୀୟ ଜରୁରୀକାଳୀନ ସାହାଯ୍ୟ ନିଅନ୍ତୁ କିମ୍ବା ନିକଟତମ ଜରୁରୀକାଳୀନ କେନ୍ଦ୍ରକୁ ଯାଆନ୍ତୁ।",
  safeUrgent:
    "ଆପଣ କହିଥିବା ଲକ୍ଷଣ ଉପରେ ଡାକ୍ତର ଦୃଷ୍ଟି ଦେବା ଉଚିତ୍। ଦିଆଯାଇଥିବା ସୂଚନା ଆଧାରରେ ଶୀଘ୍ର ଡାକ୍ତରଙ୍କ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ।",
  safeRoutine:
    "ଦିଆଯାଇଥିବା ସୂଚନା ଆଧାରରେ ଡାକ୍ତର ଆପଣଙ୍କ ଲକ୍ଷଣ ଦେଖିପାରିବେ। ଏହା ଏକ ରୁଟିଂ ପରାମର୍ଶ, ସ୍ୱାସ୍ଥ୍ୟ ମୂଲ୍ୟାଙ୍କନ ନୁହେଁ।",
  safeUncertain:
    "ଆପଣଙ୍କ ଲକ୍ଷଣ ସ୍ପଷ୍ଟ ବୁଝାପଡ଼ିଲା ନାହିଁ। ତଳେ ଗୋଟିଏ ଲକ୍ଷଣ ବାଛନ୍ତୁ, ପୁଣି କୁହନ୍ତୁ, କିମ୍ବା ଡାକ୍ତରଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ।",
  scDisclaimer:
    "ହେଲ୍ଥଫୋଲିଓର ଲକ୍ଷଣ ଚେକର ଲକ୍ଷଣ ଓ ଜରୁରୀପଣକୁ କ୍ରମରେ ରଖିବାରେ ସାହାଯ୍ୟ କରେ। ଏହା ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ନାହିଁ।",
  scListen: "ଶୁଣନ୍ତୁ",
  scTalkToDoctor: "ଡାକ୍ତରଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ",
  scStartOver: "ପୁଣି ଆରମ୍ଭ କରନ୍ତୁ",
  scNoSymptoms: "ଅନ୍ତତଃ ଗୋଟିଏ ଲକ୍ଷଣ ବାଛନ୍ତୁ କିମ୍ବା ଯାହା ଅନୁଭବ କରୁଛନ୍ତି ଲେଖନ୍ତୁ।",

  shareTitle: "ଡାକ୍ତରଙ୍କ ସହ ଶେୟାର କରନ୍ତୁ",
  shareIntro: "କେୟାର ଅନୁରୋଧ ଆଗକୁ ବଢ଼ାଉଥିବା ବେଳେ କ'ଣ ଅନ୍ତର୍ଭୁକ୍ତ କରିବେ ବାଛନ୍ତୁ।",
  shareSymptoms: "ଲକ୍ଷଣ ସାରାଂଶ",
  shareMedicines: "ଚାଲୁଥିବା ଔଷଧ",
  shareAllergies: "ଏଲର୍ଜି",
  shareConfirm: "ଶେୟାର କରନ୍ତୁ",
  scCancel: "ବାତିଲ",
  shareNoCard: "ଏହି ଡିଭାଇସରେ କୌଣସି ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ ସଂରକ୍ଷିତ ନାହିଁ — କେବଳ ଆପଣଙ୍କ ଲକ୍ଷଣ ସାରାଂଶ ଶେୟାର ହେବ।",
};

const DICTS: Record<Language, Phase2Dict> = { en, hi, or };

export function tPhase2(
  lang: Language,
  key: keyof Phase2Dict,
  vars?: Record<string, string | number>
): string {
  let text: string = DICTS[lang]?.[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}

export function hasPhase2(lang: Language, key: keyof Phase2Dict): boolean {
  return Boolean(DICTS[lang]?.[key]);
}
