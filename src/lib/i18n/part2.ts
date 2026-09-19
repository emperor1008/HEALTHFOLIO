/**
 * Part 2 interface strings — care-request wizard, triage results, emergency
 * guidance, and history states. Separate module so Part 1's Dict stays
 * stable; `translate()` falls back through: language → English → key.
 *
 * Plain-language rules: no jargon without explanation, no diagnosis wording,
 * emergency text is calm, direct, and identical in meaning across languages.
 */

import type { Language } from "./index";

export interface Part2Dict {
  // Wizard chrome
  careWizardTitle: string;
  back: string;
  continueLabel: string;
  saveForLaterWizard: string;
  stepOf: string;
  progressLabel: string;

  // Step 1: start
  careStartHeading: string;
  careStartIntro: string;
  careStartPrivacy: string;

  // Step 2: category
  categoryHeading: string;
  catBreathingOrChest: string;
  catFeverOrInfection: string;
  catPainOrInjury: string;
  catStomach: string;
  catPregnancy: string;
  catChildHealth: string;
  catOther: string;

  // Step 3: body area
  bodyAreaHeading: string;
  bodyHeadFace: string;
  bodyChest: string;
  bodyStomach: string;
  bodyArmLeg: string;
  bodyWhole: string;
  bodyNotSure: string;

  // Step 4: description / voice
  describeHeading: string;
  describePlaceholder: string;
  voiceStart: string;
  voiceStop: string;
  voiceUnavailable: string;
  voiceListenHint: string;
  transcriptionReviewLabel: string;
  transcriptionReviewHint: string;
  charLimit: string;

  // Interpretation
  interpretationHeading: string;
  interpretationWeUnderstood: string;
  interpretationUncertain: string;
  interpretationClarifyPrompt: string;
  interpretationConfirm: string;
  interpretationEdit: string;

  // Step 5: follow-ups
  followUpsHeading: string;
  fuBreathingWorseAtRest: string;
  fuChestPressureSpreading: string;
  fuBleedingWontStop: string;
  fuVomitingCannotKeepFluids: string;
  fuFeverThreeDaysOrMore: string;
  fuHeadacheSuddenWorstEver: string;
  fuInjuryFromMajorTrauma: string;
  fuSymptomsSuddenlyWorse: string;
  yes: string;
  no: string;
  notSureAnswer: string;

  // Step 6: urgency result
  urgencyHeading: string;
  urgencyEmergency: string;
  urgencyEmergencyHint: string;
  urgencyUrgent: string;
  urgencyUrgentHint: string;
  urgencyRoutine: string;
  urgencyRoutineHint: string;
  notADiagnosis: string;
  emergencyGuidanceBlock: string;
  ackEmergencyGuidance: string;
  ackedAt: string;

  // Step 7: review
  reviewHeading: string;
  reviewWhatYouTold: string;
  reviewSuggestedUrgency: string;
  reviewAttachedRecords: string;
  reviewNoRecords: string;
  reviewSaveRequest: string;
  reviewEdit: string;

  // History
  historyHeading: string;
  histSavedOnDevice: string;
  histWaitingForConnection: string;
  histSyncing: string;
  histSent: string;
  histNeedsAttention: string;
  histRetry: string;
  histRemove: string;
  histRemoveConfirm: string;
  packetSummaryLabel: string;
  packetRulesNote: string;

  // Records attach
  attachRecordsHeading: string;
  attachOwnedOnly: string;
  attachFileNameDate: string;

  // Errors
  wizardErrorGeneric: string;
  wizardOfflineSaved: string;
}

const en: Part2Dict = {
  careWizardTitle: "Care request",
  back: "Back",
  continueLabel: "Continue",
  saveForLaterWizard: "Save for later",
  stepOf: "Step {current} of {total}",
  progressLabel: "Progress",

  careStartHeading: "Let's prepare your care request",
  careStartIntro:
    "Answer a few simple questions. We will help you describe what is happening and save it safely.",
  careStartPrivacy:
    "Your answers stay on this device until they are sent. Nothing is shared without you.",

  categoryHeading: "What kind of concern is it?",
  catBreathingOrChest: "Breathing or chest concern",
  catFeverOrInfection: "Fever or infection concern",
  catPainOrInjury: "Pain or injury",
  catStomach: "Stomach concern",
  catPregnancy: "Pregnancy-related concern",
  catChildHealth: "Child health concern",
  catOther: "Other concern",

  bodyAreaHeading: "Which part of the body?",
  bodyHeadFace: "Head or face",
  bodyChest: "Chest",
  bodyStomach: "Stomach",
  bodyArmLeg: "Arm or leg",
  bodyWhole: "Whole body",
  bodyNotSure: "Not sure",

  describeHeading: "Describe it in your own words",
  describePlaceholder: "You can write a few words. This is optional.",
  voiceStart: "Start voice input",
  voiceStop: "Stop and review",
  voiceUnavailable: "Voice input is not available on this device. Please type instead.",
  voiceListenHint: "Your words will appear on screen for you to check.",
  transcriptionReviewLabel: "Check what we heard",
  transcriptionReviewHint: "Tap the text to correct it before saving.",
  charLimit: "{count} characters left",

  interpretationHeading: "Did we understand you?",
  interpretationWeUnderstood: "We understood this as: {concept}",
  interpretationUncertain: "We are not sure we understood. Could you tell us a bit more?",
  interpretationClarifyPrompt: "You can also pick from the list below.",
  interpretationConfirm: "Yes, that is right",
  interpretationEdit: "No, let me explain differently",

  followUpsHeading: "A few important questions",
  fuBreathingWorseAtRest: "Is breathing difficult even while resting?",
  fuChestPressureSpreading: "Is chest pressure spreading to arm, neck, or jaw?",
  fuBleedingWontStop: "Has bleeding not stopped after firm pressure for 10 minutes?",
  fuVomitingCannotKeepFluids: "Is the person unable to keep any fluids down?",
  fuFeverThreeDaysOrMore: "Has the fever lasted 3 days or more?",
  fuHeadacheSuddenWorstEver: "Did this headache start suddenly and feel the worst ever?",
  fuInjuryFromMajorTrauma: "Was this injury from a fall from height, road accident, or heavy object?",
  fuSymptomsSuddenlyWorse: "Did the symptoms suddenly become much worse?",
  yes: "Yes",
  no: "No",
  notSureAnswer: "Not sure",

  urgencyHeading: "What we suggest",
  urgencyEmergency: "Get emergency help now",
  urgencyEmergencyHint:
    "These answers can match a serious problem. Do not wait. Do not use this form to ask for care right now.",
  urgencyUrgent: "Please seek a clinical consultation as soon as possible.",
  urgencyUrgentHint: "A care request can help you prepare for that consultation.",
  urgencyRoutine: "A care request can help you prepare for a consultation.",
  urgencyRoutineHint: "There is nothing here that suggests an urgent problem.",
  notADiagnosis: "This tool does not diagnose medical conditions.",
  emergencyGuidanceBlock:
    "If this may be life-threatening, call your local emergency number or go to the nearest emergency facility now.",
  ackEmergencyGuidance: "I have read this. I understand where to get help.",
  ackedAt: "Guidance shown at {time}",

  reviewHeading: "Check and save",
  reviewWhatYouTold: "What you told us",
  reviewSuggestedUrgency: "Suggested urgency",
  reviewAttachedRecords: "Attached records",
  reviewNoRecords: "No records attached",
  reviewSaveRequest: "Save request",
  reviewEdit: "Edit",

  historyHeading: "My care requests",
  histSavedOnDevice: "Saved on this device",
  histWaitingForConnection: "Waiting for connection",
  histSyncing: "Syncing",
  histSent: "Sent",
  histNeedsAttention: "Needs attention",
  histRetry: "Retry",
  histRemove: "Remove from this device",
  histRemoveConfirm: "Delete this saved draft from this device? It has not been sent yet.",
  packetSummaryLabel: "Summary",
  packetRulesNote: "Safety check reference: {ids}",

  attachRecordsHeading: "Attach your records",
  attachOwnedOnly: "You can attach only records that belong to you.",
  attachFileNameDate: "{name} · {date}",

  wizardErrorGeneric: "Something did not work. Your answers are still saved on this device.",
  wizardOfflineSaved: "Saved on this device. It will be sent when a connection is available.",
};

const hi: Part2Dict = {
  careWizardTitle: "देखभाल अनुरोध",
  back: "पीछे",
  continueLabel: "आगे बढ़ें",
  saveForLaterWizard: "बाद के लिए सहेजें",
  stepOf: "चरण {current} / {total}",
  progressLabel: "प्रगति",

  careStartHeading: "आइए आपका देखभाल अनुरोध तैयार करें",
  careStartIntro:
    "कुछ आसान सवालों के जवाब दें। हम आपको बताने में मदद करेंगे कि क्या हो रहा है, और उसे सुरक्षित रखेंगे।",
  careStartPrivacy:
    "भेजे जाने तक आपके जवाब इसी डिवाइस पर रहते हैं। आपकी अनुमति के बिना कुछ साझा नहीं होता।",

  categoryHeading: "यह किस तरह की समस्या है?",
  catBreathingOrChest: "सांस या सीने की समस्या",
  catFeverOrInfection: "बुखार या संक्रमण की समस्या",
  catPainOrInjury: "दर्द या चोट",
  catStomach: "पेट संबंधी समस्या",
  catPregnancy: "गर्भावस्था से जुड़ी समस्या",
  catChildHealth: "बच्चे की सेहत की समस्या",
  catOther: "कोई अन्य समस्या",

  bodyAreaHeading: "शरीर का कौन सा हिस्सा?",
  bodyHeadFace: "सिर या चेहरा",
  bodyChest: "सीना",
  bodyStomach: "पेट",
  bodyArmLeg: "बांह या पैर",
  bodyWhole: "पूरा शरीर",
  bodyNotSure: "पता नहीं",

  describeHeading: "अपने शब्दों में बताइए",
  describePlaceholder: "कुछ शब्द लिख सकते हैं। यह ज़रूरी नहीं है।",
  voiceStart: "बोलकर बताना शुरू करें",
  voiceStop: "रोकें और जांचें",
  voiceUnavailable: "इस डिवाइस पर बोलकर लिखना उपलब्ध नहीं है। कृपया टाइप करें।",
  voiceListenHint: "आपके बोले शब्द जांचने के लिए स्क्रीन पर दिखेंगे।",
  transcriptionReviewLabel: "जांचें कि हमने क्या सुना",
  transcriptionReviewHint: "सहेजने से पहले गलती सुधारने के लिए टेक्स्ट पर टैप करें।",
  charLimit: "{count} अक्षर बचे",

  interpretationHeading: "क्या हमें बात समझ आई?",
  interpretationWeUnderstood: "हमने इसे ऐसे समझा: {concept}",
  interpretationUncertain: "हमें पूरा यकीन नहीं है। क्या आप थोड़ा और बता सकते हैं?",
  interpretationClarifyPrompt: "आप नीचे दी सूची से भी चुन सकते हैं।",
  interpretationConfirm: "हाँ, यही सही है",
  interpretationEdit: "नहीं, मैं दूसरे तरीके से बताऊंगा",

  followUpsHeading: "कुछ ज़रूरी सवाल",
  fuBreathingWorseAtRest: "क्या आराम करते समय भी सांस लेने में दिक्कत होती है?",
  fuChestPressureSpreading: "क्या सीने का दबाव बांह, गर्दन या जबड़े तक फैल रहा है?",
  fuBleedingWontStop: "क्या 10 मिनट दबाकर रखने के बाद भी खून नहीं रुका?",
  fuVomitingCannotKeepFluids: "क्या व्यक्ति को थोड़ा भी पानी भी नहीं टिक रहा?",
  fuFeverThreeDaysOrMore: "क्या बुखार 3 दिन या उससे ज़्यादा से है?",
  fuHeadacheSuddenWorstEver: "क्या सिरदर्द अचानक शुरू हुआ और अब तक का सबसे तेज़ लगा?",
  fuInjuryFromMajorTrauma: "क्या चोट ऊंचाई से गिरने, सड़क दुर्घटना या भारी वस्तु से लगी?",
  fuSymptomsSuddenlyWorse: "क्या लक्षण अचानक बहुत बिगड़ गए?",
  yes: "हाँ",
  no: "नहीं",
  notSureAnswer: "पता नहीं",

  urgencyHeading: "हमारा सुझाव",
  urgencyEmergency: "अभी आपातकालीन मदद लें",
  urgencyEmergencyHint:
    "ये जवाब किसी गंभीर समस्या से मिल सकते हैं। इंतज़ार न करें। अभी देखभाल मांगने के लिए यह फॉर्म इस्तेमाल न करें।",
  urgencyUrgent: "कृपया जल्द से जल्द डॉक्टर/चिकित्सक से संपर्क करें।",
  urgencyUrgentHint: "देखभाल अनुरोध आपको उस मुलाकात के लिए तैयार होने में मदद करेगा।",
  urgencyRoutine: "देखभाल अनुरोध आपको मुलाकात की तैयारी में मदद कर सकता है।",
  urgencyRoutineHint: "यहां कुछ भी ऐसा नहीं जो तत्काल समस्या की ओर इशारा करे।",
  notADiagnosis: "यह टूल कोई बीमारी का निदान नहीं करता।",
  emergencyGuidanceBlock:
    "अगर यह जीवन के लिए खतरा हो सकता है, तो अभी अपना स्थानीय आपातकालीन नंबर डायल करें या नज़दीकी आपातकालीन अस्पताल जाएं।",
  ackEmergencyGuidance: "मैंने यह पढ़ लिया। मैं समझता/समझती हूं कि मदद कहां मिलेगी।",
  ackedAt: "सूचना {time} पर दिखाई गई",

  reviewHeading: "जांचें और सहेजें",
  reviewWhatYouTold: "आपने हमें क्या बताया",
  reviewSuggestedUrgency: "सुझाया गया स्तर",
  reviewAttachedRecords: "जोड़े गए रिकॉर्ड",
  reviewNoRecords: "कोई रिकॉर्ड नहीं जुड़ा",
  reviewSaveRequest: "अनुरोध सहेजें",
  reviewEdit: "बदलें",

  historyHeading: "मेरे देखभाल अनुरोध",
  histSavedOnDevice: "इस डिवाइस पर सहेजा गया",
  histWaitingForConnection: "कनेक्शन की प्रतीक्षा में",
  histSyncing: "सिंक हो रहा है",
  histSent: "भेज दिया गया",
  histNeedsAttention: "ध्यान देने की ज़रूरत",
  histRetry: "फिर से कोशिश करें",
  histRemove: "इस डिवाइस से हटाएं",
  histRemoveConfirm: "इस सहेजे गए ड्राफ्ट को इस डिवाइस से हटाएं? यह अभी तक भेजा नहीं गया है।",
  packetSummaryLabel: "सारांश",
  packetRulesNote: "सुरक्षा जांच संदर्भ: {ids}",

  attachRecordsHeading: "अपने रिकॉर्ड जोड़ें",
  attachOwnedOnly: "आप केवल अपने रिकॉर्ड जोड़ सकते हैं।",
  attachFileNameDate: "{name} · {date}",

  wizardErrorGeneric: "कुछ ठीक नहीं हुआ। आपके जवाब इस डिवाइस पर सुरक्षित हैं।",
  wizardOfflineSaved: "इस डिवाइस पर सहेजा गया। कनेक्शन मिलने पर भेज दिया जाएगा।",
};

const or: Part2Dict = {
  careWizardTitle: "ଯତ୍ନ ଅନୁରୋଧ",
  back: "ପଛକୁ",
  continueLabel: "ଆଗକୁ",
  saveForLaterWizard: "ପରେ ପାଇଁ ସଂରକ୍ଷଣ",
  stepOf: "ପାଦ {current} / {total}",
  progressLabel: "ପ୍ରଗତି",

  careStartHeading: "ଆପଣଙ୍କ ଯତ୍ନ ଅନୁରୋଧ ପ୍ରସ୍ତୁତ କରିବା",
  careStartIntro:
    "କିଛି ସହଜ ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅନ୍ତୁ। କଣ ଘଟୁଛି ବର୍ଣ୍ଣନା କରିବାରେ ଆମେ ସାହାଯ୍ୟ କରିବେ ଓ ନିରାପଦ ରଖିବେ।",
  careStartPrivacy:
    "ପଠାଯିବା ପର୍ଯ୍ୟନ୍ତ ଆପଣଙ୍କ ଉତ୍ତର ଏହି ଡିଭାଇସରେ ରହିବ। ଆପଣଙ୍କ ଅନୁମତି ବିନା କିଛି ସହଭାଗ ହୁଏ ନାହିଁ।",

  categoryHeading: "ଏହା କେଉଁ ପ୍ରକାର ସମସ୍ୟା?",
  catBreathingOrChest: "ନିଶ୍ୱାସ କିମ୍ବା ଛାତି ସମସ୍ୟା",
  catFeverOrInfection: "ଜ୍ୱର କିମ୍ବା ସଂକ୍ରମଣ ସମସ୍ୟା",
  catPainOrInjury: "ଯନ୍ତ୍ରଣା କିମ୍ବା ଆଘାତ",
  catStomach: "ପେଟ ସମସ୍ୟା",
  catPregnancy: "ଗର୍ଭାବସ୍ଥା ସମ୍ବନ୍ଧୀୟ ସମସ୍ୟା",
  catChildHealth: "ପିଲାଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା",
  catOther: "ଅନ୍ୟ କୌଣସି ସମସ୍ୟା",

  bodyAreaHeading: "ଶରୀରର କେଉଁ ଅଂଶ?",
  bodyHeadFace: "ମୁଣ୍ଡ କିମ୍ବା ମୁହଁ",
  bodyChest: "ଛାତି",
  bodyStomach: "ପେଟ",
  bodyArmLeg: "ବାହୁ କିମ୍ବା ଗୋଡ଼",
  bodyWhole: "ସମ୍ପୂର୍ଣ୍ଣ ଶରୀର",
  bodyNotSure: "ନିଶ୍ଚିତ ନୁହେଁ",

  describeHeading: "ନିଜ ଶବ୍ଦରେ ବର୍ଣ୍ଣନା କରନ୍ତୁ",
  describePlaceholder: "କିଛି ଶବ୍ଦ ଲେଖିପାରିବେ। ଏହା ଆବଶ୍ୟକ ନୁହେଁ।",
  voiceStart: "ସ୍ୱର ଦ୍ୱାରା ଲେଖିବା ଆରମ୍ଭ",
  voiceStop: "ବନ୍ଦ କରି ଯାଞ୍ଚ",
  voiceUnavailable: "ଏହି ଡିଭାଇସରେ ସ୍ୱର-ଲେଖା ଉପଲବ୍ଧ ନାହିଁ। ଦୟାକରି ଟାଇପ୍ କରନ୍ତୁ।",
  voiceListenHint: "ଆପଣଙ୍କ କଥା ଯାଞ୍ଚ ପାଇଁ ସ୍କ୍ରିନରେ ଦେଖାଯିବ।",
  transcriptionReviewLabel: "ଆମେ କଣ ଶୁଣିଲୁ ଯାଞ୍ଚ କରନ୍ତୁ",
  transcriptionReviewHint: "ସଂରକ୍ଷଣ ପୂର୍ବରୁ ଠିକ୍ କରିବା ପାଇଁ ଟେକ୍ସଟ୍ ଉପରେ ଟ୍ୟାପ୍ କରନ୍ତୁ।",
  charLimit: "{count} ଅକ୍ଷର ବଳକା",

  interpretationHeading: "ଆମେ ଠିକ୍ ବୁଝିଲୁ କି?",
  interpretationWeUnderstood: "ଆମେ ଏମିତି ବୁଝିଲୁ: {concept}",
  interpretationUncertain: "ଆମେ ନିଶ୍ଚିତ ନୁହେଁ। ଦୟାକରି ଅଳ୍ପ ଅଧିକ କୁହନ୍ତୁ?",
  interpretationClarifyPrompt: "ତଳ ତାଲିକାରୁ ମଧ୍ୟ ବାଛିପାରିବେ।",
  interpretationConfirm: "ହଁ, ଏହା ଠିକ୍",
  interpretationEdit: "ନା, ମୁଁ ଅନ୍ୟ ଭାବେ କହିବି",

  followUpsHeading: "କିଛି ଜରୁରୀ ପ୍ରଶ୍ନ",
  fuBreathingWorseAtRest: "ବିଶ୍ରାମ ସମୟରେ ମଧ୍ୟ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ହେଉଛି କି?",
  fuChestPressureSpreading: "ଛାତିର ଚାପ ବାହୁ, ବେଆଁ କିମ୍ବା ହାଡ଼ ପର୍ଯ୍ୟନ୍ତ ବଢ଼ୁଛି କି?",
  fuBleedingWontStop: "10 ମିନିଟ୍ ଚିପୁଡ଼ିବା ପରେ ମଧ୍ୟ ରକ୍ତ ବନ୍ଦ ହେଉନାହିଁ କି?",
  fuVomitingCannotKeepFluids: "ବ୍ୟକ୍ତି ଅଳ୍ପ ପାଣି ମଧ୍ୟ ରଖିପାରୁନାହାନ୍ତି କି?",
  fuFeverThreeDaysOrMore: "ଜ୍ୱର 3 ଦିନ କିମ୍ବା ଅଧିକ ହେଲା କି?",
  fuHeadacheSuddenWorstEver: "ମୁଣ୍ଡ ବୁରୁଡ଼ ହଠାତ୍ ଆରମ୍ଭ ହୋଇ ଏପର୍ଯ୍ୟନ୍ତର ସବୁଠାରୁ ଖରାପ ଲାଗିଲା କି?",
  fuInjuryFromMajorTrauma: "ଆଘାତ ଉଚ୍ଚ ସ୍ଥାନରୁ ପଡ଼ିବା, ରୋଡ୍ ଦୁର୍ଘଟଣା କିମ୍ବା ଭାରୀ ଜିନିଷରୁ ହୋଇଛି କି?",
  fuSymptomsSuddenlyWorse: "ଲକ୍ଷଣ ହଠାତ୍ ବହୁତ ଖରାପ ହୋଇଗଲା କି?",
  yes: "ହଁ",
  no: "ନା",
  notSureAnswer: "ନିଶ୍ଚିତ ନୁହେଁ",

  urgencyHeading: "ଆମର ପରାମର୍ଶ",
  urgencyEmergency: "ଏବେ ଆପାତକାଳୀନ ସହାୟତା ନିଅନ୍ତୁ",
  urgencyEmergencyHint:
    "ଏହି ଉତ୍ତରଗୁଡ଼ିକ ଗମ୍ଭୀର ସମସ୍ୟା ସହ ମେଳ ଖାଇପାରେ। ଅପେକ୍ଷା କରନ୍ତୁ ନାହିଁ। ଏହି ଫର୍ମ ଦ୍ୱାରା ଏବେ ଯତ୍ନ ମାଗନ୍ତୁ ନାହିଁ।",
  urgencyUrgent: "ଦୟାକରି ଯଥା ଶୀଘ୍ର ଡାକ୍ତର/ଚିକିତ୍ସକଙ୍କ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ।",
  urgencyUrgentHint: "ଯତ୍ନ ଅନୁରୋଧ ଆପଣଙ୍କୁ ସେହି ସାକ୍ଷାତ ପାଇଁ ପ୍ରସ୍ତୁତ ହେବାରେ ସାହାଯ୍ୟ କରିବ।",
  urgencyRoutine: "ଯତ୍ନ ଅନୁରୋଧ ସାକ୍ଷାତ ପ୍ରସ୍ତୁତିରେ ସାହାଯ୍ୟ କରିପାରିବ।",
  urgencyRoutineHint: "ଏଠାରେ କିଛି ତତକାଳୀନ ସମସ୍ୟା ଇଙ୍ଗିତ କରୁନାହିଁ।",
  notADiagnosis: "ଏହି ଟୁଲ୍ କୌଣସି ରୋଗ ନିର୍ଣ୍ଣୟ କରେ ନାହିଁ।",
  emergencyGuidanceBlock:
    "ଯଦି ଏହା ଜୀବନ ପାଇଁ ବିପଦ ହୋଇପାରେ, ଏବେ ଆପଣଙ୍କ ସ୍ଥାନୀୟ ଆପାତକାଳୀନ ନମ୍ବର ଡାଲ୍ କରନ୍ତୁ କିମ୍ବା ନିକଟତମ ଆପାତକାଳୀନ କେନ୍ଦ୍ରକୁ ଯାଆନ୍ତୁ।",
  ackEmergencyGuidance: "ମୁଁ ଏହା ପଢ଼ିଲି। ସହାୟତା କେଉଁଠେ ମିଳିବ ବୁଝିଲି।",
  ackedAt: "ସୂଚନା {time} ରେ ଦେଖାଗଲା",

  reviewHeading: "ଯାଞ୍ଚ କରି ସଂରକ୍ଷଣ",
  reviewWhatYouTold: "ଆପଣ ଆମକୁ କଣ କହିଲେ",
  reviewSuggestedUrgency: "ପରାମର୍ଶିତ ସ୍ତର",
  reviewAttachedRecords: "ଯୋଡ଼ାଯାଇଥିବା ରେକର୍ଡ",
  reviewNoRecords: "କୌଣସି ରେକର୍ଡ ଯୋଡ଼ାଯାଇନାହିଁ",
  reviewSaveRequest: "ଅନୁରୋଧ ସଂରକ୍ଷଣ କରନ୍ତୁ",
  reviewEdit: "ବଦଳାନ୍ତୁ",

  historyHeading: "ମୋର ଯତ୍ନ ଅନୁରୋଧ",
  histSavedOnDevice: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ",
  histWaitingForConnection: "ସଂଯୋଗ ପାଇଁ ଅପେକ୍ଷା",
  histSyncing: "ସିଙ୍କ ହେଉଛି",
  histSent: "ପଠାଯାଇଛି",
  histNeedsAttention: "ଧ୍ୟାନ ଦେବା ଦରକାର",
  histRetry: "ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ",
  histRemove: "ଏହି ଡିଭାଇସରୁ ବାହାର କରନ୍ତୁ",
  histRemoveConfirm: "ଏହି ସେଭ ହୋଇଥିବା ଡ୍ରାଫ୍ଟକୁ ଏହି ଡିଭାଇସରୁ ବାହାର କରିବେ? ଏହା ଏପର୍ଯ୍ୟନ୍ତ ପଠାଯାଇ ନାହିଁ।",
  packetSummaryLabel: "ସାରାଂଶ",
  packetRulesNote: "ନିରାପତ୍ତା ଯାଞ୍ଚ ସନ୍ଦର୍ଭ: {ids}",

  attachRecordsHeading: "ନିଜ ରେକର୍ଡ ଯୋଡ଼ନ୍ତୁ",
  attachOwnedOnly: "ଆପଣ କେବଳ ନିଜ ରେକର୍ଡ ଯୋଡ଼ିପାରିବେ।",
  attachFileNameDate: "{name} · {date}",

  wizardErrorGeneric: "କିଛି ଠିକ୍ ହେଲା ନାହିଁ। ଆପଣଙ୍କ ଉତ୍ତର ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ।",
  wizardOfflineSaved: "ଏହି ଡିଭାଇସରେ ସଂରକ୍ଷିତ। ସଂଯୋଗ ମିଳିଲେ ପଠାଯିବ।",
};

const DICTS: Record<Language, Part2Dict> = { en, hi, or };

export function t2(
  lang: Language,
  key: keyof Part2Dict,
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

export function hasPart2(lang: Language, key: keyof Part2Dict): boolean {
  return Boolean(DICTS[lang]?.[key]);
}
