const ones = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const tens = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

const scales = ["", "thousand", "million"];

function belowHundred(n: number): string {
  if (n < 20) return ones[n] ?? "";
  const ten = Math.floor(n / 10);
  const one = n % 10;
  if (one === 0) return tens[ten] ?? "";
  return `${tens[ten]}-${ones[one]}`;
}

function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n);
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  if (remainder === 0) return `${ones[hundred]} hundred`;
  return `${ones[hundred]} hundred and ${belowHundred(remainder)}`;
}

export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return `minus ${numberToWords(-n)}`;

  const chunks: string[] = [];
  let scaleIndex = 0;
  let remaining = n;

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk !== 0) {
      let part = belowThousand(chunk);
      if (scaleIndex > 0) {
        part += ` ${scales[scaleIndex]}`;
      }
      chunks.unshift(part);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex++;
  }

  return chunks.join(" ");
}
