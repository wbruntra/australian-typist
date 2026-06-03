import { test, expect } from "bun:test";
import { numberToWords } from "./numberToWords";

test("single digits", () => {
  expect(numberToWords(0)).toBe("zero");
  expect(numberToWords(1)).toBe("one");
  expect(numberToWords(3)).toBe("three");
  expect(numberToWords(7)).toBe("seven");
  expect(numberToWords(9)).toBe("nine");
});

test("teens", () => {
  expect(numberToWords(10)).toBe("ten");
  expect(numberToWords(11)).toBe("eleven");
  expect(numberToWords(13)).toBe("thirteen");
  expect(numberToWords(17)).toBe("seventeen");
  expect(numberToWords(19)).toBe("nineteen");
});

test("twenties to nineties", () => {
  expect(numberToWords(20)).toBe("twenty");
  expect(numberToWords(37)).toBe("thirty-seven");
  expect(numberToWords(42)).toBe("forty-two");
  expect(numberToWords(99)).toBe("ninety-nine");
});

test("hundreds", () => {
  expect(numberToWords(100)).toBe("one hundred");
  expect(numberToWords(112)).toBe("one hundred and twelve");
  expect(numberToWords(200)).toBe("two hundred");
  expect(numberToWords(250)).toBe("two hundred and fifty");
  expect(numberToWords(999)).toBe("nine hundred and ninety-nine");
});

test("thousands", () => {
  expect(numberToWords(1000)).toBe("one thousand");
  expect(numberToWords(1001)).toBe("one thousand one");
  expect(numberToWords(1100)).toBe("one thousand one hundred");
  expect(numberToWords(1101)).toBe("one thousand one hundred and one");
  expect(numberToWords(2500)).toBe("two thousand five hundred");
  expect(numberToWords(2501)).toBe("two thousand five hundred and one");
});

test("complex thousands", () => {
  expect(numberToWords(147000)).toBe("one hundred and forty-seven thousand");
  expect(numberToWords(147899)).toBe(
    "one hundred and forty-seven thousand eight hundred and ninety-nine",
  );
});

test("million boundary", () => {
  expect(numberToWords(999999)).toBe(
    "nine hundred and ninety-nine thousand nine hundred and ninety-nine",
  );
  expect(numberToWords(1000000)).toBe("one million");
});

test("negative numbers", () => {
  expect(numberToWords(-1)).toBe("minus one");
  expect(numberToWords(-42)).toBe("minus forty-two");
});
