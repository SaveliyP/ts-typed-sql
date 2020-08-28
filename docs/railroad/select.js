Diagram(
    Optional('from'),
    ZeroOrMore('where'),
    Optional(
        Sequence(
            'groupBy',
            ZeroOrMore('having')
        ), 'skip'
    ),
    'select',
    Optional('orderBy', 'skip'),
    Optional('limit', 'skip'),
    Optional('offset', 'skip')
)