ALTER TABLE yoga_membership_types
    ALTER COLUMN price TYPE INTEGER USING ROUND(price)::INTEGER;

ALTER TABLE yoga_memberships
    ALTER COLUMN purchase_price TYPE INTEGER USING ROUND(purchase_price)::INTEGER;
