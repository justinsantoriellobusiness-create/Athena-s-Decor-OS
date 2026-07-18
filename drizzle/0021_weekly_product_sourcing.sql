-- Custom SQL migration file, put your code below! --

-- Product sourcing scrape: daily → weekly. The nightly CJ searches were
-- tripping CJ's API rate limit (429s) and burning LLM credits on the AI
-- fallback; weekly is plenty for discovering new products. Existing rows
-- must be updated here because the UI-saved config overrides code defaults.
UPDATE `autonomous_configs`
SET `frequencyHours` = 168,
    `nextAutoRunAt` = DATE_ADD(COALESCE(`lastAutoRunAt`, NOW()), INTERVAL 168 HOUR)
WHERE `module` = 'product_sourcing' AND `frequencyHours` < 168;
