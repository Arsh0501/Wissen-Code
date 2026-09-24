# Two Sum

**Difficulty:** Easy
**Tags:** array, hash-map
**CPU Time Limit (seconds):** 2
**Memory Limit (KB):** 256000

## Problem Statement

Given an array of integers `nums` and an integer `target`, return the indices of the two numbers such that they add up to `target`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.

**Constraints:**
- 2 ≤ nums.length ≤ 10⁴
- -10⁹ ≤ nums[i] ≤ 10⁹
- -10⁹ ≤ target ≤ 10⁹
- Only one valid answer exists.

## Sample Test Cases

### Sample 1
**Input:**
```
2 7 11 15
9
```

**Output:**
```
0 1
```

### Sample 2
**Input:**
```
3 2 4
6
```

**Output:**
```
1 2
```

## Hidden Test Cases

### Hidden 1
**Input:**
```
3 3
6
```

**Output:**
```
0 1
```

### Hidden 2
**Input:**
```
1 5 3 7 2
9
```

**Output:**
```
1 3
```

### Hidden 3
**Input:**
```
-1 -2 -3 -4 -5
-8
```

**Output:**
```
2 4
```

## Starter Code

### Python
```python
# Read input
nums = list(map(int, input().split()))
target = int(input())

# Your solution here
def two_sum(nums, target):
    pass

result = two_sum(nums, target)
print(result[0], result[1])
```

### Java
```java
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String[] parts = sc.nextLine().split(" ");
        int[] nums = new int[parts.length];
        for (int i = 0; i < parts.length; i++) nums[i] = Integer.parseInt(parts[i]);
        int target = sc.nextInt();
        
        // Your solution here
        int[] result = twoSum(nums, target);
        System.out.println(result[0] + " " + result[1]);
    }
    
    static int[] twoSum(int[] nums, int target) {
        return new int[]{0, 0};
    }
}
```

### C++
```c++
#include <bits/stdc++.h>
using namespace std;

int main() {
    string line;
    getline(cin, line);
    istringstream iss(line);
    vector<int> nums;
    int x;
    while (iss >> x) nums.push_back(x);
    
    int target;
    cin >> target;
    
    // Your solution here
    
    return 0;
}
```

### JavaScript
```javascript
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];

rl.on('line', (line) => lines.push(line.trim()));
rl.on('close', () => {
    const nums = lines[0].split(' ').map(Number);
    const target = parseInt(lines[1]);
    
    // Your solution here
    function twoSum(nums, target) {
        return [0, 0];
    }
    
    const result = twoSum(nums, target);
    console.log(result[0] + ' ' + result[1]);
});
```

