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
    AlternatingSequence(
        Sequence(
            Optional('orderBy', 'skip'),
            Optional('limit', 'skip'),
            Optional('offset', 'skip')
        ),
        Choice(0, 'union', 'unionAll', 'intersect', 'intersectAll', 'except', 'exceptAll')
    )
)