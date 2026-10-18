export interface BadgeProgress {
  current: number;
  total: number;
  percent: number;
  label: string;
}

export function getDaysElapsedInWeek(refDate: Date = new Date()): number {
  const day = refDate.getUTCDay();
  return day === 0 ? 7 : day; // 1 (Mon) to 7 (Sun)
}

export function getBadgeProgress(
  badgeKey: string,
  isUnlocked: boolean,
  context: {
    rescued?: number;
    wasted?: number;
    target?: number;
    isPactMet?: boolean;
    refDate?: Date;
  } = {}
): BadgeProgress {
  if (isUnlocked) {
    return { current: 1, total: 1, percent: 100, label: 'Unlocked' };
  }

  const rescued = context.rescued ?? 0;
  const isPactMet = context.isPactMet ?? true;

  switch (badgeKey) {
    case 'scrappy_chef': {
      const cur = Math.min(rescued, 5);
      return {
        current: cur,
        total: 5,
        percent: Math.round((cur / 5) * 100),
        label: `${cur} of 5 rescues this week`,
      };
    }

    case 'onion_survivor': {
      return {
        current: 0,
        total: 1,
        percent: 0,
        label: '0 of 1 urgent rescues',
      };
    }

    case 'freezer_archaeologist': {
      return {
        current: 0,
        total: 60,
        percent: 0,
        label: '0 of 60 days frozen',
      };
    }

    case 'pact_keeper': {
      // Must not show 100% while locked; progress wording matches unlock rule (7 days keeping waste below target)
      if (!isPactMet) {
        return {
          current: 0,
          total: 7,
          percent: 0,
          label: 'Waste limit exceeded this week',
        };
      }
      // While locked, active week can be at most 6 of 7 days completed (max 85%)
      const daysElapsed = getDaysElapsedInWeek(context.refDate);
      const activeDays = Math.min(daysElapsed, 6);
      const percent = Math.min(Math.round((activeDays / 7) * 100), 85);
      return {
        current: activeDays,
        total: 7,
        percent,
        label: `${activeDays} of 7 days below waste limit`,
      };
    }

    default:
      return {
        current: 0,
        total: 1,
        percent: 0,
        label: 'In progress',
      };
  }
}
