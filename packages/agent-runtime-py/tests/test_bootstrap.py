import unittest

from weki_agents import __version__


class BootstrapTest(unittest.TestCase):
    def test_version_is_scaffolded(self) -> None:
        self.assertEqual(__version__, "0.0.0")
