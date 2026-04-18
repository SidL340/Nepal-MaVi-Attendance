/**
 * Nepali Calendar (Bikram Sambat) Engine
 * Covers years 2080 BS – 2090 BS
 * Nepali month names and day-count lookup tables
 */

const NepaliCalendar = (() => {

  // Month names
  const NEPALI_MONTHS = [
    { np: 'बैशाख',  en: 'Baisakh'  },
    { np: 'जेठ',    en: 'Jestha'   },
    { np: 'अषाढ',   en: 'Ashadh'   },
    { np: 'श्रावण', en: 'Shrawan'  },
    { np: 'भाद्र',  en: 'Bhadra'   },
    { np: 'आश्विन', en: 'Ashwin'   },
    { np: 'कार्तिक',en: 'Kartik'   },
    { np: 'मंसिर',  en: 'Mangsir'  },
    { np: 'पौष',    en: 'Poush'    },
    { np: 'माघ',    en: 'Magh'     },
    { np: 'फाल्गुन',en: 'Falgun'   },
    { np: 'चैत्र',  en: 'Chaitra'  },
  ];

  const NEPALI_DAYS = [
    { np: 'आइतबार',  en: 'Sunday'    },
    { np: 'सोमबार',  en: 'Monday'    },
    { np: 'मंगलबार', en: 'Tuesday'   },
    { np: 'बुधबार',  en: 'Wednesday' },
    { np: 'बिहिबार', en: 'Thursday'  },
    { np: 'शुक्रबार',en: 'Friday'    },
    { np: 'शनिबार',  en: 'Saturday'  },
  ];

  /**
   * Days in each month for BS years 2080–2090
   * Each row = [year, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12]
   */
  const BS_MONTH_DATA = {
    2080: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2081: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2084: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2085: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2086: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
    2087: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2088: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2089: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
    2090: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  };

  // Reference: 2083 Baisakh 1 = 2026 April 14 (AD)
  const REF_BS = { year: 2083, month: 1, day: 1 };
  const REF_AD = new Date(2026, 3, 14); // April 14, 2026

  function daysInBSMonth(year, month) {
    if (!BS_MONTH_DATA[year]) return 30;
    return BS_MONTH_DATA[year][month - 1];
  }

  function totalDaysInBSYear(year) {
    if (!BS_MONTH_DATA[year]) return 365;
    return BS_MONTH_DATA[year].reduce((a, b) => a + b, 0);
  }

  /**
   * Convert AD Date to BS date {year, month, day}
   */
  function adToBS(adDate) {
    const msPerDay = 86400000;
    const diffDays = Math.round((new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate()) - REF_AD) / msPerDay);

    let bsYear = REF_BS.year;
    let bsMonth = REF_BS.month;
    let bsDay = REF_BS.day;

    let remaining = diffDays;

    if (remaining >= 0) {
      // Forward
      while (remaining > 0) {
        const daysLeft = daysInBSMonth(bsYear, bsMonth) - bsDay;
        if (remaining <= daysLeft) {
          bsDay += remaining;
          remaining = 0;
        } else {
          remaining -= daysLeft + 1;
          bsDay = 1;
          bsMonth++;
          if (bsMonth > 12) {
            bsMonth = 1;
            bsYear++;
          }
        }
      }
    } else {
      // Backward
      remaining = Math.abs(remaining);
      while (remaining > 0) {
        if (remaining < bsDay) {
          bsDay -= remaining;
          remaining = 0;
        } else {
          remaining -= bsDay;
          bsMonth--;
          if (bsMonth < 1) {
            bsMonth = 12;
            bsYear--;
          }
          bsDay = daysInBSMonth(bsYear, bsMonth);
        }
      }
    }

    return { year: bsYear, month: bsMonth, day: bsDay };
  }

  /**
   * Convert BS date {year, month, day} to AD Date
   */
  function bsToAD(bsYear, bsMonth, bsDay) {
    const msPerDay = 86400000;

    // Calculate total days from REF_BS to target BS date
    let totalDays = 0;
    let y = REF_BS.year;
    let m = REF_BS.month;
    let d = REF_BS.day;

    // Simple approach: iterate day by day (max ~3650 days for 10 years)
    // For performance, we calculate month-by-month

    if (bsYear > REF_BS.year || (bsYear === REF_BS.year && bsMonth > REF_BS.month) || 
        (bsYear === REF_BS.year && bsMonth === REF_BS.month && bsDay >= REF_BS.day)) {
      // Forward
      // Days remaining in ref month
      totalDays += daysInBSMonth(y, m) - d;
      m++;
      if (m > 12) { m = 1; y++; }

      while (y < bsYear || (y === bsYear && m < bsMonth)) {
        totalDays += daysInBSMonth(y, m);
        m++;
        if (m > 12) { m = 1; y++; }
      }
      totalDays += bsDay;
    } else {
      // Backward
      totalDays -= (d - 1);
      // go to start of ref month
      m--;
      if (m < 1) { m = 12; y--; }

      while (y > bsYear || (y === bsYear && m > bsMonth)) {
        totalDays -= daysInBSMonth(y, m);
        m--;
        if (m < 1) { m = 12; y--; }
      }
      totalDays -= (daysInBSMonth(bsYear, bsMonth) - bsDay + 1);
    }

    return new Date(REF_AD.getTime() + totalDays * msPerDay);
  }

  /**
   * Get today's BS date
   */
  function today() {
    return adToBS(new Date());
  }

  /**
   * Format BS date as string
   */
  function format(bsDate, pattern = 'YYYY-MM-DD') {
    const { year, month, day } = bsDate;
    return pattern
      .replace('YYYY', year)
      .replace('MM', String(month).padStart(2, '0'))
      .replace('DD', String(day).padStart(2, '0'));
  }

  /**
   * Format BS date with Nepali month name
   */
  function formatNepali(bsDate) {
    const { year, month, day } = bsDate;
    const monthInfo = NEPALI_MONTHS[month - 1];
    return `${day} ${monthInfo.np} ${year}`;
  }

  function formatEnglish(bsDate) {
    const { year, month, day } = bsDate;
    const monthInfo = NEPALI_MONTHS[month - 1];
    return `${day} ${monthInfo.en} ${year} BS`;
  }

  function getMonthName(month, lang = 'np') {
    return NEPALI_MONTHS[month - 1]?.[lang] || '';
  }

  function getMonths() {
    return NEPALI_MONTHS;
  }

  function getDays() {
    return NEPALI_DAYS;
  }

  function getAvailableYears() {
    return Object.keys(BS_MONTH_DATA).map(Number);
  }

  /**
   * Parse 'YYYY-MM-DD' string to BS object
   */
  function parse(str) {
    const [year, month, day] = str.split('-').map(Number);
    return { year, month, day };
  }

  /**
   * Get day of week name for a BS date
   */
  function getDayOfWeek(bsDate, lang = 'np') {
    const ad = bsToAD(bsDate.year, bsDate.month, bsDate.day);
    return NEPALI_DAYS[ad.getDay()][lang];
  }

  return {
    adToBS,
    bsToAD,
    today,
    format,
    formatNepali,
    formatEnglish,
    getMonthName,
    getMonths,
    getDays,
    getAvailableYears,
    daysInBSMonth,
    parse,
    getDayOfWeek,
  };
})();

