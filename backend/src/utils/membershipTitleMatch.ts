const normalizeMembershipTitle = (value: string | null | undefined): string => {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

export const isMembershipTitleMatch = (
  membershipTypeName: string | null | undefined,
  classTitle: string | null | undefined
): boolean => {
  const normalizedMembershipTypeName = normalizeMembershipTitle(membershipTypeName);
  const normalizedClassTitle = normalizeMembershipTitle(classTitle);

  if (!normalizedMembershipTypeName || !normalizedClassTitle) {
    return false;
  }

  if (normalizedMembershipTypeName === normalizedClassTitle) {
    return true;
  }

  if (!normalizedMembershipTypeName.startsWith(normalizedClassTitle)) {
    return false;
  }

  const nextCharacter = normalizedMembershipTypeName.slice(normalizedClassTitle.length, normalizedClassTitle.length + 1);
  return !/\p{L}/u.test(nextCharacter);
};

export const sortMembershipRowsByTitleMatch = <
  T extends {
    membership_type_name?: string | null;
    created_at?: string | Date | null;
    is_title_match?: boolean | null;
  }
>(
  memberships: T[],
  classTitle: string | null | undefined
): T[] => {
  return [...memberships].sort((left, right) => {
    const leftScore = (typeof left.is_title_match === 'boolean'
      ? left.is_title_match
      : isMembershipTitleMatch(left.membership_type_name, classTitle)) ? 0 : 1;
    const rightScore = (typeof right.is_title_match === 'boolean'
      ? right.is_title_match
      : isMembershipTitleMatch(right.membership_type_name, classTitle)) ? 0 : 1;

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftCreatedAt = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightCreatedAt = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightCreatedAt - leftCreatedAt;
  });
};
