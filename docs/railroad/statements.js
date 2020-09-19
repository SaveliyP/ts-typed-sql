Diagram(
    Choice(0, 
        Sequence(
            Choice(0,
                Skip(),
                'with',
                Sequence(
                    'withRecursive',
                    Choice(0, 'recursive', 'recursiveAll')
                )
            ),
            Choice(1,
                NonTerminal('Insert Statement'),
                NonTerminal('Select Statement'),
                NonTerminal('Update Statement'),
                NonTerminal('Delete Statement'),
            ),
            'execute'
        ),
        'raw'
    )
)