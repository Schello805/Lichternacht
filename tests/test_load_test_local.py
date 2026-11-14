import argparse
import importlib.util
from pathlib import Path
import unittest


specification = importlib.util.spec_from_file_location('load_test_local', Path(__file__).resolve().parents[1] / 'scripts/load-test-local.py')
load_test = importlib.util.module_from_spec(specification)
specification.loader.exec_module(load_test)


class LocalLoadTestLimits(unittest.TestCase):
    def test_concurrency_and_request_bounds(self):
        self.assertEqual(load_test.bounded_integer(1, 24)('1'), 1)
        self.assertEqual(load_test.bounded_integer(1, 24)('24'), 24)
        for value in ('0', '25', '-1'):
            with self.assertRaises(argparse.ArgumentTypeError):
                load_test.bounded_integer(1, 24)(value)
        for value in ('9', '2001'):
            with self.assertRaises(argparse.ArgumentTypeError):
                load_test.bounded_integer(10, 2000)(value)
