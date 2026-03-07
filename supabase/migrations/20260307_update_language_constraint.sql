-- Update language constraint to support 30 languages
ALTER TABLE proximity_presence
DROP CONSTRAINT IF EXISTS proximity_presence_language_check;

ALTER TABLE proximity_presence
ADD CONSTRAINT proximity_presence_language_check
CHECK (language IN (
  'en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi',
  'nl', 'pl', 'tr', 'vi', 'th', 'id', 'uk', 'el', 'he', 'sv', 'cs', 'ro',
  'hu', 'fi', 'da', 'no', 'ms', 'tl'
));
