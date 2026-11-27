import sys


def solve(a: int, b: int) -> int:
    return a + b


if __name__ == "__main__":
    a, b = map(int, sys.stdin.buffer.read().split())
    print(solve(a, b))
