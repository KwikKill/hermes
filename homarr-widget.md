# Homarr widget - Hermes Feed

Custom JSX widget pointing at `https://hermes.somi.<WEBSITE_HOST>/rss/feed/all`
as its data source. Kept here (not consumed by the app) purely as a copy the
user pastes into Homarr's widget editor by hand - update this file whenever
the widget changes so the two don't drift.

```jsx
<Stack gap='md' p='xs'>
  <Group justify='space-between' wrap='nowrap'>
    <Title order={3}>Hermes Feed</Title>
    <Badge size='lg' color='gray' variant='light'>{data.items.length} items</Badge>
  </Group>

  <Collapsible title={'Upcoming (' + data.items.filter(i => i.isFuture).length + ')'} defaultOpen={false}>
    <Stack gap='xs' pt='xs'>
      {data.items.filter(i => i.isFuture).map(item =>
        <Card withBorder p='xs' radius='md' style={{opacity: item.seen ? 0.5 : 1}}>
          <Group wrap='nowrap' align='flex-start'>
            {item.image ? <Avatar src={item.image} size={40} radius='sm' /> : <ThemeIcon size={40} radius='sm' color={item.category === 'YOUTUBE' ? 'red' : item.category === 'ANIME' ? 'grape' : 'teal'}><Text fw={700} size='xs'>{item.category.slice(0,1)}</Text></ThemeIcon>}
            <Stack gap={2} style={{flex: 1, minWidth: 0}}>
              <Group gap='xs' wrap='nowrap'>
                <Badge size='xs' color={item.category === 'YOUTUBE' ? 'red' : item.category === 'ANIME' ? 'grape' : 'teal'} variant='light'>{item.category}</Badge>
                <Text size='xs' c='dimmed' truncate>{item.source}</Text>
              </Group>
              <Anchor href={item.link} target='_blank' underline='hover'>
                <Text size='sm' fw={600} lineClamp={2} td={item.seen ? 'line-through' : undefined}>{item.title}</Text>
              </Anchor>
              <Text size='xs' c='dimmed'>{item.publishedAtDisplay}</Text>
            </Stack>
            <Checkbox
              checked={item.seen}
              onChange={(e) => fetch('https://hermes.somi.<WEBSITE_HOST>/rss/feed/' + item.id + '/seen', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({seen: e.currentTarget.checked})})}
            />
          </Group>
        </Card>
      )}
    </Stack>
  </Collapsible>

  <Divider label='Recent' labelPosition='center' />

  <ScrollArea h={360}>
    <PaginatedList pageSize={8}>
      {data.items.filter(i => !i.isFuture).map(item =>
        <Card withBorder p='xs' radius='md' mb='xs' style={{opacity: item.seen ? 0.5 : 1}}>
          <Group wrap='nowrap' align='flex-start'>
            {item.image ? <Avatar src={item.image} size={40} radius='sm' /> : <ThemeIcon size={40} radius='sm' color={item.category === 'YOUTUBE' ? 'red' : item.category === 'ANIME' ? 'grape' : 'teal'}><Text fw={700} size='xs'>{item.category.slice(0,1)}</Text></ThemeIcon>}
            <Stack gap={2} style={{flex: 1, minWidth: 0}}>
              <Group gap='xs' wrap='nowrap'>
                <Badge size='xs' color={item.category === 'YOUTUBE' ? 'red' : item.category === 'ANIME' ? 'grape' : 'teal'} variant='light'>{item.category}</Badge>
                <Text size='xs' c='dimmed' truncate>{item.source}</Text>
              </Group>
              <Anchor href={item.link} target='_blank' underline='hover'>
                <Text size='sm' fw={600} lineClamp={2} td={item.seen ? 'line-through' : undefined}>{item.title}</Text>
              </Anchor>
              {item.description ? <Text size='xs' c='dimmed' lineClamp={2}>{item.description}</Text> : null}
              <Text size='xs' c='dimmed'>{item.publishedAtDisplay}</Text>
            </Stack>
            <Checkbox
              checked={item.seen}
              onChange={(e) => fetch('https://hermes.somi.<WEBSITE_HOST>/rss/feed/' + item.id + '/seen', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({seen: e.currentTarget.checked})})}
            />
          </Group>
        </Card>
      )}
    </PaginatedList>
  </ScrollArea>
</Stack>
```

Replace `<WEBSITE_HOST>` with the real domain. `Checkbox` needs to be available in
whatever component scope Homarr's custom widget exposes (same family as
`Card`/`Stack`/`Badge` etc. already in use) - if Homarr's widget sandbox
doesn't expose Mantine's `Checkbox`, swap it for a plain
`<input type='checkbox' checked={item.seen} onChange={...} />` with the same
`onChange` body.
