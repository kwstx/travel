/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();

  const costs = new Array<number>();
  for (let j = 0; j <= b.length; j++) {
    costs[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    costs[0] = i;
    let nw = i - 1;
    for (let j = 1; j <= b.length; j++) {
      const cj = Math.min(
        costs[j] + 1,
        costs[j - 1] + 1,
        a[i - 1] === b[j - 1] ? nw : nw + 1
      );
      nw = costs[j];
      costs[j] = cj;
    }
  }
  return costs[b.length];
}

/**
 * Calculates the Jaro-Winkler distance between two strings (value between 0 and 1).
 * 1 means exact match, 0 means no similarity.
 */
export function jaroWinklerDistance(s1: string, s2: string): number {
  let m1 = s1.toLowerCase().trim();
  let m2 = s2.toLowerCase().trim();

  if (m1 === m2) return 1.0;

  const len1 = m1.length;
  const len2 = m2.length;
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1 = new Array<boolean>(len1).fill(false);
  const matches2 = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (!matches2[j] && m1[i] === m2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (m1[i] !== m2[k]) transpositions++;
      k++;
    }
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler correction
  const prefixScaling = 0.1;
  let prefixLength = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (m1[i] === m2[i]) prefixLength++;
    else break;
  }

  return jaro + prefixLength * prefixScaling * (1 - jaro);
}

/**
 * Checks if a pair of names is a duplicate based on Jaro-Winkler distance.
 */
export function areNamesDuplicate(first1: string, last1: string, first2: string, last2: string, threshold = 0.85): boolean {
  const f1 = first1.trim().toLowerCase();
  const l1 = last1.trim().toLowerCase();
  const f2 = first2.trim().toLowerCase();
  const l2 = last2.trim().toLowerCase();

  // Exact Match
  if (f1 === f2 && l1 === l2) return true;

  const jwFirst = jaroWinklerDistance(f1, f2);
  const jwLast = jaroWinklerDistance(l1, l2);

  // If both first and last name match closely, or combined full name matches closely
  const name1 = `${f1} ${l1}`;
  const name2 = `${f2} ${l2}`;
  const jwFull = jaroWinklerDistance(name1, name2);

  return (jwFirst >= threshold && jwLast >= threshold) || jwFull >= threshold;
}
