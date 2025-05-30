"""
Sample Python file for testing chunking functionality
This file contains various Python code structures to test language-aware chunking
"""

import os
import json
from typing import List, Dict, Optional


def greet(name: str) -> str:
    """Simple greeting function"""
    return f"Hello, {name}!"


class Calculator:
    """A simple calculator class with method chaining"""
    
    def __init__(self):
        self.result = 0
    
    def add(self, value: float) -> 'Calculator':
        """Add a value to the result"""
        self.result += value
        return self
    
    def subtract(self, value: float) -> 'Calculator':
        """Subtract a value from the result"""
        self.result -= value
        return self
    
    def multiply(self, value: float) -> 'Calculator':
        """Multiply the result by a value"""
        self.result *= value
        return self
    
    def divide(self, value: float) -> 'Calculator':
        """Divide the result by a value"""
        if value == 0:
            raise ValueError("Division by zero")
        self.result /= value
        return self
    
    def get_result(self) -> float:
        """Get the current result"""
        return self.result
    
    def reset(self) -> 'Calculator':
        """Reset the calculator to zero"""
        self.result = 0
        return self


async def fetch_data(url: str) -> Dict:
    """Async function to fetch data (mock implementation)"""
    import aiohttp
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"HTTP error! status: {response.status}")
                return await response.json()
    except Exception as error:
        print(f"Error fetching data: {error}")
        raise


def process_list(items: List) -> Dict[str, List]:
    """Process a list and categorize items by type"""
    result = {
        'numbers': [],
        'strings': [],
        'others': []
    }
    
    for item in items:
        if item is None:
            continue
        elif isinstance(item, (int, float)):
            result['numbers'].append(item)
        elif isinstance(item, str):
            result['strings'].append(item.strip())
        else:
            result['others'].append(item)
    
    return result


class DataProcessor:
    """A more complex class for data processing"""
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.processed_count = 0
    
    def process_file(self, filepath: str) -> Dict:
        """Process a file and return statistics"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
        
        with open(filepath, 'r') as file:
            content = file.read()
        
        stats = {
            'lines': len(content.splitlines()),
            'characters': len(content),
            'words': len(content.split()),
            'filepath': filepath
        }
        
        self.processed_count += 1
        return stats
    
    def batch_process(self, filepaths: List[str]) -> List[Dict]:
        """Process multiple files"""
        results = []
        for filepath in filepaths:
            try:
                result = self.process_file(filepath)
                results.append(result)
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
        
        return results


if __name__ == "__main__":
    # Example usage
    calc = Calculator()
    result = calc.add(10).multiply(2).subtract(5).get_result()
    print(f"Calculator result: {result}")
    
    # Test data processing
    processor = DataProcessor()
    sample_data = [1, 2, "hello", None, 3.14, "world", [1, 2, 3]]
    processed = process_list(sample_data)
    print(f"Processed data: {processed}") 