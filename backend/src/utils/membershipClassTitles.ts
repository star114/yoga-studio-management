export const normalizeMembershipClassTitle = (value: string | null | undefined): string => {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

export const buildNormalizedTitleSql = (expression: string): string => {
  return `regexp_replace(trim(replace(COALESCE(${expression}, ''), chr(160), ' ')), '[[:space:]]+', ' ', 'g')`;
};

export const buildMembershipClassTitleMatchExistsSql = (
  membershipTypeTableAlias: string,
  classTitleExpression: string
): string => {
  return `
    EXISTS (
      SELECT 1
      FROM yoga_membership_type_class_titles mtct
      WHERE mtct.membership_type_id = ${membershipTypeTableAlias}.membership_type_id
        AND ${buildNormalizedTitleSql('mtct.class_title')} = ${buildNormalizedTitleSql(classTitleExpression)}
    )
  `;
};

