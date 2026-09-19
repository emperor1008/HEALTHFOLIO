/**
 * Part 4 interface strings — medicine search, pharmacy availability,
 * stock console, and confirmation requests. Falls back through
 * language → English → key, same as part2/part3.
 *
 * No dosage/treatment wording exists anywhere in this dictionary by design.
 */

import type { Language } from "./index";

export interface Part4Dict {
  // Search
  findMedicine: string;
  searchPlaceholder: string;
  search: string;
  didYouMean: string;
  useThisMatch: string;
  notWhatIWant: string;
  clearSearch: string;
  // Identity confirmation
  confirmIdentity: string;
  identityGeneric: string;
  identityForm: string;
  identityStrength: string;
  identityKeepOriginal: string;
  // Results
  availabilityResults: string;
  reportedAvailable: string;
  limitedStock: string;
  reportedUnavailable: string;
  notStocked: string;
  notRecentlyConfirmed: string;
  noUpdateAvailable: string;
  lastConfirmed: string;
  contactBeforeTravelling: string;
  availabilityCanChange: string;
  noPharmacies: string;
  noResultsForMedicine: string;
  // Request
  requestConfirmation: string;
  requestExplanation: string;
  requestSentOffline: string;
  requestSent: string;
  myRequests: string;
  requestPending: string;
  requestResponded: string;
  requestCancelled: string;
  responseConfirmed: string;
  responseLimited: string;
  responseUnavailable: string;
  responseCannotConfirm: string;
  nonBindingNote: string;
  // Status labels
  statusOffline: string;
  statusSaved: string;
  statusWaiting: string;
  statusSyncing: string;
  statusUpdated: string;
  statusNeedsAttention: string;
  // Staff console
  pharmacyConsole: string;
  updateStock: string;
  batchUpdate: string;
  requestsToAnswer: string;
  recentUpdates: string;
  available: string;
  lowStock: string;
  unavailable: string;
  notStockedLabel: string;
  saveUpdate: string;
  internalNoteLabel: string;
  internalNoteHint: string;
  quantityLabel: string;
  quantityNeverShown: string;
  needsReconfirmation: string;
  noMembership: string;
  freshnessFresh: string;
  freshnessAging: string;
  freshnessStale: string;
  freshnessExpired: string;
  // Safety
  notMedicalAdvice: string;
}

const en: Part4Dict = {
  findMedicine: "Find a medicine",
  searchPlaceholder: "Type the medicine name",
  search: "Search",
  didYouMean: "Did you mean",
  useThisMatch: "Use this match",
  notWhatIWant: "No, keep my spelling",
  clearSearch: "Clear",
  confirmIdentity: "Confirm the medicine",
  identityGeneric: "Generic name",
  identityForm: "Form",
  identityStrength: "Strength",
  identityKeepOriginal: "This is not my medicine",
  availabilityResults: "Availability at participating pharmacies",
  reportedAvailable: "Reported available by this pharmacy",
  limitedStock: "Limited stock was reported",
  reportedUnavailable: "Currently reported unavailable",
  notStocked: "This pharmacy reports it does not stock this item",
  notRecentlyConfirmed: "This information may be out of date. Contact the pharmacy before travelling.",
  noUpdateAvailable: "This pharmacy has not shared availability for this medicine.",
  lastConfirmed: "Last confirmed",
  availabilityCanChange: "Availability can change. Please confirm with the pharmacy before travelling.",
  contactBeforeTravelling: "Availability can change. Please confirm with the pharmacy before travelling.",
  noPharmacies: "No participating pharmacy has shared information yet. Please check again later.",
  noResultsForMedicine: "No pharmacy has shared availability for this medicine yet.",
  requestConfirmation: "Ask the pharmacy to confirm",
  requestExplanation:
    "We will ask this pharmacy to confirm availability. This is only a question — it does not reserve or hold any medicine.",
  requestSentOffline: "Saved on this device. It will send when a connection is available.",
  requestSent: "Request sent to the pharmacy.",
  myRequests: "My confirmation requests",
  requestPending: "Waiting for the pharmacy to respond",
  requestResponded: "The pharmacy responded",
  requestCancelled: "Cancelled",
  responseConfirmed: "Confirmed available",
  responseLimited: "Limited availability",
  responseUnavailable: "Unavailable",
  responseCannotConfirm: "Cannot confirm right now",
  nonBindingNote: "This is not a reservation, payment, or order.",
  statusOffline: "You are offline. Saved requests will send when connection returns.",
  statusSaved: "Saved on this device",
  statusWaiting: "Waiting for connection",
  statusSyncing: "Syncing",
  statusUpdated: "Updated",
  statusNeedsAttention: "Needs attention",
  pharmacyConsole: "Pharmacy stock console",
  updateStock: "Update stock",
  batchUpdate: "Batch update",
  requestsToAnswer: "Requests needing a response",
  recentUpdates: "Recent updates",
  available: "Available",
  lowStock: "Low stock",
  unavailable: "Unavailable",
  notStockedLabel: "Not stocked",
  saveUpdate: "Save update",
  internalNoteLabel: "Staff note (never shown to patients)",
  internalNoteHint: "Optional. Visible only to your pharmacy team.",
  quantityLabel: "Approximate quantity (optional)",
  quantityNeverShown: "Never shown to patients unless you enable patient display.",
  needsReconfirmation: "Needs reconfirmation",
  noMembership: "No pharmacy access is configured for this account. Ask your coordinator to assign you.",
  freshnessFresh: "Confirmed recently",
  freshnessAging: "Confirmed earlier today or yesterday",
  freshnessStale: "Not recently confirmed",
  freshnessExpired: "Information expired",
  notMedicalAdvice: "This is stock information only. It is not medical advice.",
};

const hi: Part4Dict = {
  findMedicine: "दवा खोजें",
  searchPlaceholder: "दवा का नाम लिखें",
  search: "खोजें",
  didYouMean: "क्या आप यह चाहते हैं",
  useThisMatch: "यही चुनें",
  notWhatIWant: "नहीं, मेरी वर्तनी रखें",
  clearSearch: "साफ़ करें",
  confirmIdentity: "दवा की पुष्टि करें",
  identityGeneric: "सामान्य नाम",
  identityForm: "रूप",
  identityStrength: "मात्रा (शक्ति)",
  identityKeepOriginal: "यह मेरी दवा नहीं है",
  availabilityResults: "भाग लेने वाली फार्मेसियों में उपलब्धता",
  reportedAvailable: "इस फार्मेसी ने उपलब्ध बताया है",
  limitedStock: "सीमित स्टॉक बताया गया है",
  reportedUnavailable: "अभी उपलब्ध नहीं बताया गया",
  notStocked: "यह फार्मेसी यह चीज़ नहीं रखती",
  notRecentlyConfirmed: "यह जानकारी पुरानी हो सकती है। जाने से पहले फार्मेसी से पुष्टि करें।",
  noUpdateAvailable: "इस फार्मेसी ने इस दवा की जानकारी नहीं दी है।",
  lastConfirmed: "आख़िरी पुष्टि",
  availabilityCanChange: "उपलब्धता बदल सकती है। जाने से पहले फार्मेसी से पुष्टि करें।",
  contactBeforeTravelling: "उपलब्धता बदल सकती है। जाने से पहले फार्मेसी से पुष्टि करें।",
  noPharmacies: "अभी किसी भाग लेने वाली फार्मेसी ने जानकारी नहीं दी है। कृपया बाद में देखें।",
  noResultsForMedicine: "इस दवा के लिए अभी किसी फार्मेसी ने जानकारी नहीं दी है।",
  requestConfirmation: "फार्मेसी से पुष्टि माँगें",
  requestExplanation:
    "हम इस फार्मेसी से उपलब्धता की पुष्टि पूछेंगे। यह केवल एक सवाल है — इससे कोई दवा आरक्षित नहीं होती।",
  requestSentOffline: "इस डिवाइस पर सुरक्षित है। कनेक्शन मिलने पर भेजा जाएगा।",
  requestSent: "फार्मेसी को अनुरोध भेजा गया।",
  myRequests: "मेरे पुष्टि अनुरोध",
  requestPending: "फार्मेसी के जवाब की प्रतीक्षा",
  requestResponded: "फार्मेसी ने जवाब दिया",
  requestCancelled: "रद्द",
  responseConfirmed: "उपलब्ध है",
  responseLimited: "सीमित उपलब्धता",
  responseUnavailable: "उपलब्ध नहीं",
  responseCannotConfirm: "अभी पुष्टि नहीं हो सकी",
  nonBindingNote: "यह कोई आरक्षण, भुगतान या ऑर्डर नहीं है।",
  statusOffline: "आप ऑफ़लाइन हैं। कनेक्शन लौटने पर सहेजे अनुरोध भेजे जाएँगे।",
  statusSaved: "इस डिवाइस पर सुरक्षित",
  statusWaiting: "कनेक्शन की प्रतीक्षा",
  statusSyncing: "सिंक हो रहा है",
  statusUpdated: "अपडेट हो गया",
  statusNeedsAttention: "ध्यान देना ज़रूरी",
  pharmacyConsole: "फार्मेसी स्टॉक कंसोल",
  updateStock: "स्टॉक अपडेट करें",
  batchUpdate: "एक साथ अपडेट",
  requestsToAnswer: "जवाब देने के अनुरोध",
  recentUpdates: "हाल के अपडेट",
  available: "उपलब्ध",
  lowStock: "कम स्टॉक",
  unavailable: "उपलब्ध नहीं",
  notStockedLabel: "नहीं रखते",
  saveUpdate: "अपडेट सहेजें",
  internalNoteLabel: "स्टाफ नोट (मरीज़ों को नहीं दिखता)",
  internalNoteHint: "वैकल्पिक। केवल आपकी फार्मेसी टीम देख सकती है।",
  quantityLabel: "अनुमानित मात्रा (वैकल्पिक)",
  quantityNeverShown: "मरीज़ों को तब तक नहीं दिखता जब तक आप सक्षम न करें।",
  needsReconfirmation: "दोबारा पुष्टि चाहिए",
  noMembership: "इस खाते के लिए कोई फार्मेसी एक्सेस नहीं है। अपने कोऑर्डिनेटर से कहें।",
  freshnessFresh: "हाल में पुष्ट",
  freshnessAging: "आज या कल पुष्ट",
  freshnessStale: "हाल में पुष्ट नहीं",
  freshnessExpired: "जानकारी समाप्त",
  notMedicalAdvice: "यह केवल स्टॉक की जानकारी है। यह चिकित्सा सलाह नहीं है।",
};

const or: Part4Dict = {
  findMedicine: "ଔଷଧ ଖୋଜନ୍ତୁ",
  searchPlaceholder: "ଔଷଧର ନାମ ଲେଖନ୍ତୁ",
  search: "ଖୋଜନ୍ତୁ",
  didYouMean: "ଆପଣ ଏହା ଚାହୁଁଛନ୍ତି କି",
  useThisMatch: "ଏହା ବାଛନ୍ତୁ",
  notWhatIWant: "ନା, ମୋ ବନାନ ରଖନ୍ତୁ",
  clearSearch: "ସଫା କରନ୍ତୁ",
  confirmIdentity: "ଔଷଧ ନିଶ୍ଚିତ କରନ୍ତୁ",
  identityGeneric: "ସାଧାରଣ ନାମ",
  identityForm: "ରୂପ",
  identityStrength: "ମାତ୍ରା (ଶକ୍ତି)",
  identityKeepOriginal: "ଏହା ମୋ ଔଷଧ ନୁହେଁ",
  availabilityResults: "ଭାଗିଦାର ଫାର୍ମେସୀଗୁଡ଼ିକରେ ଉପଲବ୍ଧତା",
  reportedAvailable: "ଏହି ଫାର୍ମେସୀ ଉପଲବ୍ଧ ବୋଲି କହିଛି",
  limitedStock: "ସୀମିତ ଷ୍ଟକ ରହିଛି ବୋଲି କୁହାଯାଇଛି",
  reportedUnavailable: "ବର୍ତ୍ତମାନ ଉପଲବ୍ଧ ନାହିଁ ବୋଲି କୁହାଯାଇଛି",
  notStocked: "ଏହି ଫାର୍ମେସୀ ଏହା ରଖେ ନାହିଁ",
  notRecentlyConfirmed: "ଏହି ସୂଚନା ପୁରୁଣା ହୋଇପାରେ। ଯିବା ପୂର୍ବରୁ ଫାର୍ମେସୀ ସହ ଯାଞ୍ଚ କରନ୍ତୁ।",
  noUpdateAvailable: "ଏହି ଫାର୍ମେସୀ ଏହି ଔଷଧ ପାଇଁ ସୂଚନା ଦେଇ ନାହାଁନ୍ତି।",
  lastConfirmed: "ଶେଷ ନିଶ୍ଚିତ",
  availabilityCanChange: "ଉପଲବ୍ଧତା ବଦଳିପାରେ। ଯିବା ପୂର୍ବରୁ ଫାର୍ମେସୀ ସହ ଯାଞ୍ଚ କରନ୍ତୁ।",
  contactBeforeTravelling: "ଉପଲବ୍ଧତା ବଦଳିପାରେ। ଯିବା ପୂର୍ବରୁ ଫାର୍ମେସୀ ସହ ଯାଞ୍ଚ କରନ୍ତୁ।",
  noPharmacies: "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଭାଗିଦାର ଫାର୍ମେସୀ ସୂଚନା ଦେଇ ନାହାଁନ୍ତି। ଦୟାକରି ପରେ ଦେଖନ୍ତୁ।",
  noResultsForMedicine: "ଏହି ଔଷଧ ପାଇଁ ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଫାର୍ମେସୀ ସୂଚନା ଦେଇ ନାହାଁନ୍ତି।",
  requestConfirmation: "ଫାର୍ମେସୀଠାରୁ ନିଶ୍ଚିତତା ପଚାରନ୍ତୁ",
  requestExplanation:
    "ଆମେ ଏହି ଫାର୍ମେସୀଠାରୁ ଉପଲବ୍ଧତା ଯାଞ୍ଚ କରିବୁ। ଏହା କେବଳ ଏକ ପ୍ରଶ୍ନ — ଏହା କୌଣସି ଔଷଧ ସଂରକ୍ଷିତ କରେ ନାହିଁ।",
  requestSentOffline: "ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ। ସଂଯୋଗ ମିଳିଲେ ପଠାଯିବ।",
  requestSent: "ଫାର୍ମେସୀକୁ ଅନୁରୋଧ ପଠାଗଲା।",
  myRequests: "ମୋର ନିଶ୍ଚିତତା ଅନୁରୋଧ",
  requestPending: "ଫାର୍ମେସୀର ଉତ୍ତର ପାଇଁ ଅପେକ୍ଷା",
  requestResponded: "ଫାର୍ମେସୀ ଉତ୍ତର ଦେଇଛି",
  requestCancelled: "ବାତିଲ",
  responseConfirmed: "ଉପଲବ୍ଧ ଅଛି",
  responseLimited: "ସୀମିତ ଉପଲବ୍ଧତା",
  responseUnavailable: "ଉପଲବ୍ଧ ନାହିଁ",
  responseCannotConfirm: "ଏବେ ନିଶ୍ଚିତ କରିପାରିବେ ନାହିଁ",
  nonBindingNote: "ଏହା କୌଣସି ସଂରକ୍ଷଣ, ଦେୟ ବା ଅର୍ଡର ନୁହେଁ।",
  statusOffline: "ଆପଣ ଅଫଲାଇନ୍। ସଂଯୋଗ ଫେରିଲେ ସଂରକ୍ଷିତ ଅନୁରୋଧ ପଠାଯିବ।",
  statusSaved: "ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ",
  statusWaiting: "ସଂଯୋଗ ପାଇଁ ଅପେକ୍ଷା",
  statusSyncing: "ସିଙ୍କ ହେଉଛି",
  statusUpdated: "ଅପଡେଟ ହୋଇଗଲା",
  statusNeedsAttention: "ଧ୍ୟାନ ଦେବା ଆବଶ୍ୟକ",
  pharmacyConsole: "ଫାର୍ମେସୀ ଷ୍ଟକ କନସୋଲ",
  updateStock: "ଷ୍ଟକ ଅପଡେଟ କରନ୍ତୁ",
  batchUpdate: "ଏକାଠି ଅପଡେଟ",
  requestsToAnswer: "ଉତ୍ତର ଦେବାକୁ ଅନୁରୋଧ",
  recentUpdates: "ସାମ୍ପ୍ରତିକ ଅପଡେଟ",
  available: "ଉପଲବ୍ଧ",
  lowStock: "କମ୍ ଷ୍ଟକ",
  unavailable: "ଉପଲବ୍ଧ ନାହିଁ",
  notStockedLabel: "ରଖନ୍ତି ନାହିଁ",
  saveUpdate: "ଅପଡେଟ ସେଭ୍ କରନ୍ତୁ",
  internalNoteLabel: "ଷ୍ଟାଫ୍ ନୋଟ (ରୋଗୀଙ୍କୁ ଦେଖାଯାଏ ନାହିଁ)",
  internalNoteHint: "ଇଚ୍ଛାଧୀନ। କେବଳ ଆପଣଙ୍କ ଫାର୍ମେସୀ ଟିମ୍ ଦେଖିପାରିବେ।",
  quantityLabel: "ଆନୁମାନିକ ପରିମାଣ (ଇଚ୍ଛାଧୀନ)",
  quantityNeverShown: "ଆପଣ ସକ୍ଷମ ନ କରିବା ପର୍ଯ୍ୟନ୍ତ ରୋଗୀଙ୍କୁ ଦେଖାଯାଏ ନାହିଁ।",
  needsReconfirmation: "ପୁଣି ନିଶ୍ଚିତତା ଦରକାର",
  noMembership: "ଏହି ଖାତା ପାଇଁ କୌଣସି ଫାର୍ମେସୀ ପ୍ରବେଶ ନାହିଁ। ନିଜ ସହଯୋଗୀଙ୍କୁ କୁହନ୍ତୁ।",
  freshnessFresh: "ଏବେ ନିଶ୍ଚିତ",
  freshnessAging: "ଆଜି ବା ଗତକାଲି ନିଶ୍ଚିତ",
  freshnessStale: "ଏବେ ନିଶ୍ଚିତ ନାହିଁ",
  freshnessExpired: "ସୂଚନା ମୟାଦ ଉତୀର୍ଣ୍ଣ",
  notMedicalAdvice: "ଏହା କେବଳ ଷ୍ଟକ ସୂଚନା। ଏହା ଚିକିତ୍ସା ପରାମର୍ଶ ନୁହେଁ।",
};

export const PART4_DICT: Record<Language, Part4Dict> = { en, hi, or };

export function getPart4Dict(language: Language): Part4Dict {
  return PART4_DICT[language] ?? en;
}
