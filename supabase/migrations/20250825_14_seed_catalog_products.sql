-- Migration 14 — seed one canonical catalog.product per family + a resolver
-- mapping the app DB product_type enum → catalog.product.id. Prerequisite for
-- syncing app requests into marketplace.request (product_id NOT NULL FK).
INSERT INTO catalog.product (family_id, code, label, currency, active, sort_order)
SELECT pf.id, pf.code, pf.label, 'MUR', true, pf.sort_order
FROM catalog.product_family pf
WHERE NOT EXISTS (SELECT 1 FROM catalog.product p WHERE p.code = pf.code);

CREATE OR REPLACE FUNCTION catalog.product_id_for_app_type(p_app_type text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = catalog, public AS $$
  SELECT p.id FROM catalog.product p
  WHERE p.code = CASE p_app_type
    WHEN 'mortgage' THEN 'home_loan'
    WHEN 'personal_loan' THEN 'personal_loan'
    WHEN 'sme_loan' THEN 'business_loan'
    WHEN 'business_loan' THEN 'business_loan'
    WHEN 'business_account' THEN 'business_loan'
    WHEN 'fixed_deposit' THEN 'deposit'
    WHEN 'savings_account' THEN 'savings'
    WHEN 'investment_account' THEN 'savings'
    WHEN 'credit_card' THEN 'credit_card'
    WHEN 'education_loan' THEN 'education_loan'
    WHEN 'vehicle_loan' THEN 'vehicle_loan'
    ELSE 'personal_loan'
  END
  LIMIT 1;
$$;
