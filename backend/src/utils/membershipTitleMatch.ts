const normalizeMembershipTitle = (value: string | null | undefined): string => {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

type MembershipTitleMatchKind = 'exact' | 'suffix' | 'none';
const CONTINUATION_LETTER_REGEX = /[A-Za-z\u3131-\u314E\u314F-\u3163\uAC00-\uD7A3]/u;

export const getMembershipTitleMatchKind = (
  membershipTypeName: string | null | undefined,
  classTitle: string | null | undefined
): MembershipTitleMatchKind => {
  const normalizedMembershipTypeName = normalizeMembershipTitle(membershipTypeName);
  const normalizedClassTitle = normalizeMembershipTitle(classTitle);

  if (!normalizedMembershipTypeName || !normalizedClassTitle) {
    return 'none';
  }

  if (normalizedMembershipTypeName === normalizedClassTitle) {
    return 'exact';
  }

  if (!normalizedMembershipTypeName.startsWith(normalizedClassTitle)) {
    return 'none';
  }

  const nextCharacter = normalizedMembershipTypeName.slice(normalizedClassTitle.length, normalizedClassTitle.length + 1);
  return CONTINUATION_LETTER_REGEX.test(nextCharacter) ? 'none' : 'suffix';
};

export const isMembershipTitleMatch = (
  membershipTypeName: string | null | undefined,
  classTitle: string | null | undefined
): boolean => {
  return getMembershipTitleMatchKind(membershipTypeName, classTitle) !== 'none';
};

const getMembershipRowMatchKind = <
  T extends {
    membership_type_name?: string | null;
    is_title_match?: boolean | null;
    title_match_kind?: MembershipTitleMatchKind | null;
  }
>(
  membership: T,
  classTitle: string | null | undefined
): MembershipTitleMatchKind => {
  if (membership.title_match_kind) {
    return membership.title_match_kind;
  }

  if (typeof membership.is_title_match === 'boolean') {
    return membership.is_title_match ? 'suffix' : 'none';
  }

  return getMembershipTitleMatchKind(membership.membership_type_name, classTitle);
};

export const sortMembershipRowsByTitleMatch = <
  T extends {
    membership_type_name?: string | null;
    created_at?: string | Date | null;
    is_title_match?: boolean | null;
    title_match_kind?: MembershipTitleMatchKind | null;
  }
>(
  memberships: T[],
  classTitle: string | null | undefined
): T[] => {
  return [...memberships].sort((left, right) => {
    const leftMatchKind = getMembershipRowMatchKind(left, classTitle);
    const rightMatchKind = getMembershipRowMatchKind(right, classTitle);
    const scoreByKind: Record<MembershipTitleMatchKind, number> = {
      exact: 0,
      suffix: 1,
      none: 2,
    };
    const leftScore = scoreByKind[leftMatchKind];
    const rightScore = scoreByKind[rightMatchKind];

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftCreatedAt = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightCreatedAt = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightCreatedAt - leftCreatedAt;
  });
};
