Diagram(
    'update',
    Optional('using', 'skip'),
    ZeroOrMore('where'),
    'set',
    Optional('returning')
)